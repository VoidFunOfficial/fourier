import { avatarFail, finite } from "./model.ts";
import type { AvatarBackend, AvatarDrawable, AvatarParameters, AvatarPoint } from "./types.ts";

export interface AvatarPlacement { readonly position?: AvatarPoint; readonly scale?: number; readonly opacity?: number }
/** One WebGL renderer shared by native layer/mesh rigs and Cubism drawables. */
export class AvatarWebGLRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffers: readonly WebGLBuffer[];
  private readonly textures = new Map<string, WebGLTexture>();
  private readonly maskTexture: WebGLTexture;
  private readonly maskBuffer: WebGLFramebuffer;
  private disposed = false;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly backend: AvatarBackend) {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!gl) avatarFail("Avatar 需要 WebGL2", "AVATAR_WEBGL_UNAVAILABLE"); this.gl = gl;
    const shader = (type: number, source: string) => {
      const result = gl.createShader(type)!; gl.shaderSource(result, source); gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(result); gl.deleteShader(result); avatarFail(`Avatar shader: ${error}`, "AVATAR_WEBGL_ERROR"); }
      return result;
    };
    const vertex = shader(gl.VERTEX_SHADER, `#version 300 es
      in vec2 aPosition; in vec2 aUv; out vec2 uv; uniform vec2 viewport; uniform vec2 offset; uniform float scale;
      void main(){vec2 p=aPosition*scale+offset; gl_Position=vec4(p.x/viewport.x*2.-1.,1.-p.y/viewport.y*2.,0.,1.); uv=aUv;}`);
    const fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float; in vec2 uv; out vec4 color; uniform sampler2D image; uniform sampler2D mask;
      uniform vec2 viewport; uniform float opacity; uniform int masked; uniform bool inverted; uniform vec3 multiplyColor; uniform vec3 screenColor;
      void main(){vec4 c=texture(image,uv); c.rgb*=multiplyColor; c.rgb+=screenColor*c.a-c.rgb*screenColor; c*=opacity; float a=masked==1?texture(mask,gl_FragCoord.xy/viewport).a:1.; if(masked==1&&inverted)a=1.-a; color=c*a;}`);
    this.program = gl.createProgram()!; gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) { gl.deleteProgram(this.program); avatarFail("Avatar shader 链接失败", "AVATAR_WEBGL_ERROR"); }
    this.buffers = [gl.createBuffer()!, gl.createBuffer()!, gl.createBuffer()!];
    this.maskTexture = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    this.textureParameters(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.maskBuffer = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.maskTexture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { this.dispose(); avatarFail("Avatar mask framebuffer 创建失败"); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  private textureParameters(): void {
    const gl = this.gl; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  async ready(): Promise<void> {
    try {
      for (const src of this.backend.textures) {
        // Fourier imports become routed local asset URLs; no request is made while sampling.
        const image = new Image(); image.src = src; await image.decode();
        if (this.disposed) return;
        const gl = this.gl; const texture = gl.createTexture()!; this.textures.set(src, texture);
        gl.bindTexture(gl.TEXTURE_2D, texture); this.textureParameters(); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      }
    } catch (error) { this.dispose(); throw error; }
  }
  render(params: AvatarParameters, placement: AvatarPlacement = {}): void {
    if (this.disposed) avatarFail("Avatar renderer 已释放");
    const scale = finite(placement.scale ?? Math.min(this.canvas.width / this.backend.canvas[0], this.canvas.height / this.backend.canvas[1]), "scale");
    if (scale <= 0) avatarFail("scale 必须大于零");
    const position = placement.position ?? [this.canvas.width / 2, this.canvas.height / 2];
    finite(position[0], "position.x"); finite(position[1], "position.y");
    const opacity = Math.min(1, Math.max(0, finite(placement.opacity ?? 1, "opacity")));
    const gl = this.gl; gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.useProgram(this.program);
    gl.uniform2f(gl.getUniformLocation(this.program, "viewport"), this.canvas.width, this.canvas.height);
    gl.uniform2f(gl.getUniformLocation(this.program, "offset"), position[0] - this.backend.canvas[0] * scale / 2, position[1] - this.backend.canvas[1] * scale / 2);
    gl.uniform1f(gl.getUniformLocation(this.program, "scale"), scale);
    gl.uniform1i(gl.getUniformLocation(this.program, "image"), 0); gl.uniform1i(gl.getUniformLocation(this.program, "mask"), 1);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const items = this.backend.sample(params); const byId = new Map(items.map(d => [d.id, d]));
    const draw = (item: AvatarDrawable, maskPass: boolean) => {
      for (const [i, [name, data]] of ([["aPosition", item.vertices], ["aUv", item.uvs]] as const).entries()) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[i]!); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        const location = gl.getAttribLocation(this.program, name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers[2]!); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, item.indices, gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.get(item.texture) ?? null);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, maskPass ? this.textures.get(item.texture) ?? null : this.maskTexture);
      gl.uniform1f(gl.getUniformLocation(this.program, "opacity"), item.opacity * (maskPass ? 1 : opacity));
      gl.uniform3f(gl.getUniformLocation(this.program, "multiplyColor"), ...(item.multiplyColor ?? [1, 1, 1] as const));
      gl.uniform3f(gl.getUniformLocation(this.program, "screenColor"), ...(item.screenColor ?? [0, 0, 0] as const));
      gl.uniform1i(gl.getUniformLocation(this.program, "masked"), !maskPass && item.masks.length ? 1 : 0);
      gl.uniform1i(gl.getUniformLocation(this.program, "inverted"), item.invertedMask ? 1 : 0);
      if (!maskPass && item.blend === "add") gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
      else if (!maskPass && item.blend === "multiply") gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      else gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawElements(gl.TRIANGLES, item.indices.length, gl.UNSIGNED_SHORT, 0);
    };
    for (const item of items) {
      if (item.maskOnly || item.opacity <= 0) continue;
      if (item.masks.length) {
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskBuffer); gl.clear(gl.COLOR_BUFFER_BIT);
        for (const id of item.masks) { const mask = byId.get(id); if (mask) draw(mask, true); }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
      }
      draw(item, false);
    }
    gl.flush();
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    const gl = this.gl; for (const texture of this.textures.values()) gl.deleteTexture(texture); this.textures.clear();
    for (const buffer of this.buffers) gl.deleteBuffer(buffer);
    gl.deleteTexture(this.maskTexture); gl.deleteFramebuffer(this.maskBuffer); gl.deleteProgram(this.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
