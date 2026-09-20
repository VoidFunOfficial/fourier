import { useRef, type ComponentProps } from '@fourier-video/sdk';
import { AmbientLight, Box3, BoxGeometry, CanvasTexture, Color, DirectionalLight, DoubleSide, FourierCanvas, GLTFLoader, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene, Vector3, type Object3D } from '@fourier-video/sdk/three';
import { officialModelJSON } from '../assets/model/official.ts';
import { C, lerp, smooth } from './design.ts';
export type Pose = {
    eye: [
        number,
        number,
        number
    ];
    target?: [
        number,
        number,
        number
    ];
    rotation?: [
        number,
        number,
        number
    ];
    scale?: number;
    position?: [
        number,
        number,
        number
    ];
    up?: [
        number,
        number,
        number
    ];
    fov?: number;
    shadow?: number;
};
export function blendPose(a: Pose, b: Pose, p: number): Pose {
    const u = smooth(p), v = (x: number[] | undefined, y: number[] | undefined, fallback: number[]) => fallback.map((d, i) => lerp(x?.[i] ?? d, y?.[i] ?? d, u)) as [
        number,
        number,
        number
    ];
    return { up: v(a.up, b.up, [0, 1, 0]), eye: v(a.eye, b.eye, [0, 0, 12]), target: v(a.target, b.target, [0, 0, 0]), rotation: v(a.rotation, b.rotation, [0, 0, 0]), position: v(a.position, b.position, [0, 0, 0]), scale: lerp(a.scale ?? 1, b.scale ?? 1, u), fov: lerp(a.fov ?? 34, b.fov ?? 34, u), shadow: lerp(a.shadow ?? .2, b.shadow ?? .2, u) };
}
export const HERO: Pose = { eye: [8, 6, 12], target: [0, 0, 0], rotation: [0, 0, 0], fov: 34 };
export const TOP: Pose = { up: [0, 0, -1], eye: [0, 15, .001], target: [0, 0, 0], rotation: [0, 0, 0], fov: 34, shadow: 0 };
export function disposeTree(root: Object3D) {
    root.traverse(o => {
        if (o instanceof Mesh) {
            o.geometry.dispose();
            for (const m of Array.isArray(o.material) ? o.material : [o.material])
                m.dispose();
        }
    });
}
export function makeEnvironment(renderer: Parameters<NonNullable<ComponentProps<typeof FourierCanvas>['onCreate']>>[0]['renderer']) {
    const env = new Scene();
    env.background = new Color('#b4b5b8');
    const room = new Mesh(new BoxGeometry(30, 25, 30), new MeshBasicMaterial({ color: '#b3b4b7', side: DoubleSide }));
    env.add(room);
    for (const [x, y, z, w, h, color] of [[-7, 6, 4, 6, 12, '#ffffff'], [6, 7, -5, 9, 11, '#ffffff'], [0, 11, 0, 12, 8, '#eeeeee'], [1, 4, 9, 8, 10, '#ffffff'], [-5, 3, 7, 2, 9, '#444444']] as const) {
        const panel = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color, side: DoubleSide }));
        panel.position.set(x, y, z);
        panel.lookAt(0, 0, 0);
        env.add(panel);
    }
    const pm = new PMREMGenerator(renderer);
    const target = pm.fromScene(env, .03);
    disposeTree(env);
    pm.dispose();
    return target;
}
export function Product({ pose, dark = false, timeScale = 1 }: {
    pose: (time: number) => Pose;
    timeScale?: number;
    dark?: boolean;
}) {
    const refs = useRef<{
        model: Group;
        shadow: Mesh;
        key: DirectionalLight;
    } | null>(null);
    return <FourierCanvas ariaLabel="Apple official Mac mini AR model, converted through Blender" style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }} onCreate={async ({ renderer, scene, camera }) => {
            renderer.setClearColor(new Color(dark ? '#1d1d1f' : C.paper), 1);
            const env = makeEnvironment(renderer);
            scene.environment = env.texture;
            scene.environmentIntensity = 1.02;
            const gltf = await new GLTFLoader().parseAsync(officialModelJSON(), '');
            const model = gltf.scene;
            const box = new Box3().setFromObject(model);
            const span = box.getSize(new Vector3());
            const center = box.getCenter(new Vector3());
            model.position.sub(center);
            const group = new Group();
            const normalized = new Group();
            normalized.add(model);
            normalized.scale.setScalar(5 / span.x);
            group.add(normalized);
            scene.add(group);
            model.traverse(o => {
                if (o instanceof Mesh) {
                    // USD cap and logo are coplanar. Depth bias changes rasterization only.
                    if (o.name === 'rMHtcvhlJhIrFkE' || o.name === 'CsFmvMEZAtRNEWA') {
                        const materials = Array.isArray(o.material) ? o.material : [o.material];
                        const adjusted = materials.map(m => { const clone = m.clone(); clone.polygonOffset = true; clone.polygonOffsetFactor = o.name === 'CsFmvMEZAtRNEWA' ? -2 : -1; clone.polygonOffsetUnits = clone.polygonOffsetFactor; return clone; });
                        o.material = Array.isArray(o.material) ? adjusted : adjusted[0]!;
                    }
                    for (const m of Array.isArray(o.material) ? o.material : [o.material])
                        if (m instanceof MeshStandardMaterial) {
                            m.envMapIntensity = 1;
                            // Preserve the official base color, roughness and normal textures.
                        }
                }
            });
            const ambient = new AmbientLight('#ffffff', .23);
            const key = new DirectionalLight('#ffffff', 1.9);
            key.position.set(-4, 8, 6);
            const fill = new DirectionalLight('#ffffff', .55);
            fill.position.set(4, 2, -5);
            scene.add(ambient, key, fill);
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d')!;
            const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 125);
            g.addColorStop(0, 'rgba(0,0,0,.4)');
            g.addColorStop(.35, 'rgba(0,0,0,.2)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 256, 256);
            const texture = new CanvasTexture(canvas);
            const shadow = new Mesh(new PlaneGeometry(10, 10), new MeshBasicMaterial({ map: texture, transparent: true, opacity: .5, depthWrite: false }));
            shadow.rotation.x = -Math.PI / 2;
            shadow.position.y = -1.15;
            scene.add(shadow);
            if (camera instanceof PerspectiveCamera) {
                camera.near = .6;
                camera.far = 60;
            }
            refs.current = { model: group, shadow, key };
            return () => { refs.current = null; scene.remove(group, ambient, key, fill, shadow); disposeTree(group); disposeTree(shadow); texture.dispose(); env.dispose(); scene.environment = null; };
        }} onFrame={({ timeSeconds, camera }) => {
            const r = refs.current;
            if (!r)
                return;
            const p = pose(timeSeconds * timeScale);
            r.model.rotation.set(...(p.rotation ?? [0, 0, 0]));
            r.model.position.set(...(p.position ?? [0, 0, 0]));
            r.model.scale.setScalar(p.scale ?? 1);
            camera.position.set(...p.eye);
            camera.up.set(...(p.up ?? [0, 1, 0]));
            camera.lookAt(...(p.target ?? [0, 0, 0]));
            if (camera instanceof PerspectiveCamera) {
                camera.fov = p.fov ?? 34;
                camera.updateProjectionMatrix();
            }
            (r.shadow.material as MeshBasicMaterial).opacity = p.shadow ?? .25;
            r.key.position.set(-4 + Math.sin(timeSeconds * timeScale * .35) * 2, 8, 6);
        }}/>;
}
