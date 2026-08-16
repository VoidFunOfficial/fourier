import {
  defineReact,
  useFourierRenderDriver,
  useMemo,
  type FourierRenderDriver,
} from "@fourier-video/sdk";
import imageUrl from "./dom-canvas-image.svg";

export default defineReact({
  name: "DomCanvasImageReadback",
  schema: {},
  component() {
    const driver = useMemo<FourierRenderDriver>(() => ({
      async ready() {
        const image = new Image();
        image.src = imageUrl;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("missing Canvas 2D context");
        context.drawImage(image, 0, 0, 2, 2);
        const pixel = context.getImageData(0, 0, 1, 1).data;
        if (pixel[0] !== 0 || pixel[1] !== 255 || pixel[2] !== 0 || pixel[3] !== 255) {
          throw new Error(`unexpected imported image pixel: ${[...pixel].join(",")}`);
        }
      },
      render() {},
    }), []);
    useFourierRenderDriver(driver);
    return <img src={imageUrl} width={2} height={2} alt="" />;
  },
  designPreview() {
    return { props: {}, composition: { width: 2, height: 2, durationSeconds: 1 } };
  },
});
