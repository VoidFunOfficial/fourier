import type { HandPropDefinition } from "./hand-props-backend.ts";
import magicWand from "./art/props/magicWand.png";
import conductorBaton from "./art/props/conductorBaton.png";
import microphone from "./art/props/microphone.png";
import bouquet from "./art/props/bouquet.png";
import heartSign from "./art/props/heartSign.png";
import lollipop from "./art/props/lollipop.png";
import coffeeCup from "./art/props/coffeeCup.png";
import book from "./art/props/book.png";
import paintbrush from "./art/props/paintbrush.png";
import foldingFan from "./art/props/foldingFan.png";

/** Ten generated transparent artworks, each calibrated at its actual handle. */
export const voidavatarHandProps: readonly HandPropDefinition[] = Object.freeze([
  { id: "magicWand", texture: magicWand, canvas: [1024, 1536], region: [0.2958984375, 0.028645833333333332, 0.7041015625, 0.9680989583333334], grip: [0.4990234375, 0.8463541666666666], height: 245 },
  { id: "conductorBaton", texture: conductorBaton, canvas: [1196, 1315], region: [0.45735785953177255, 0.03193916349809886, 0.5434782608695652, 0.9688212927756654], grip: [0.5, 0.8669201520912547], height: 255 },
  { id: "microphone", texture: microphone, canvas: [1024, 1536], region: [0.28515625, 0.07356770833333333, 0.716796875, 0.921875], grip: [0.5, 0.72265625], height: 180 },
  { id: "bouquet", texture: bouquet, canvas: [1205, 1306], region: [0.17344398340248962, 0.06508422664624809, 0.8307053941908714, 0.9418070444104135], grip: [0.4995850622406639, 0.8016845329249617], height: 210 },
  { id: "heartSign", texture: heartSign, canvas: [1024, 1536], region: [0.115234375, 0.115234375, 0.8837890625, 0.908203125], grip: [0.5, 0.7942708333333334], height: 205 },
  { id: "lollipop", texture: lollipop, canvas: [1024, 1536], region: [0.236328125, 0.125, 0.7626953125, 0.916015625], grip: [0.5, 0.7877604166666666], height: 180 },
  { id: "coffeeCup", texture: coffeeCup, canvas: [1374, 1145], region: [0.22707423580786026, 0.17903930131004367, 0.8820960698689956, 0.8724890829694323], grip: [0.8442503639010189, 0.5109170305676856], height: 150 },
  { id: "book", texture: book, canvas: [1086, 1448], region: [0.1427255985267035, 0.14157458563535913, 0.8591160220994475, 0.8770718232044199], grip: [0.5119705340699816, 0.8314917127071824], height: 150 },
  { id: "paintbrush", texture: paintbrush, canvas: [1024, 1536], region: [0.4580078125, 0.022135416666666668, 0.5458984375, 0.9674479166666666], grip: [0.5, 0.78125], height: 220 },
  { id: "foldingFan", texture: foldingFan, canvas: [1536, 1024], region: [0.015625, 0.0703125, 0.984375, 0.9453125], grip: [0.5, 0.884765625], height: 180 },
]);
