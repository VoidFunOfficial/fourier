import { describe, expect, test } from "bun:test";
import {
  bindTemplateProps,
  Canvas,
  defineProject,
  defineTemplate,
  field,
  Project,
  ReactLayer,
  readProjectDefinition,
  readProjectElement,
  Text,
  Timeline,
  Transform,
  Video,
} from "../src/index.ts";

describe("Project JSX SDK", () => {
  test("defineProject 生成可识别的 data-only declaration", () => {
    const definition = defineProject(
      <Project id="sdk-project" version="1.0" audioSampleRate={48_000}>
        <Canvas width={1920} height={1080} fps={30} background="#000" colorSpace="sRGB" />
        <Timeline />
      </Project>,
    );
    expect(readProjectDefinition(definition)).toBe(definition);
    expect(readProjectElement(definition.declaration)).toMatchObject({ tag: "project" });
  });

  test("defineTemplate 绑定 typed props、默认值并拒绝未知字段", () => {
    const template = defineTemplate({
      schema: {
        title: field.string(),
        count: field.number({ default: 2, integer: true, min: 1 }),
        duration: field.time({ default: "3f" }),
      },
      render: () => (
        <Project id="template" version="1.0" audioSampleRate={48_000}>
          <Canvas width={64} height={64} fps={30} background="#000" colorSpace="sRGB" />
          <Timeline />
        </Project>
      ),
    });
    expect(bindTemplateProps(template, { title: "Card" })).toMatchObject({
      props: { title: "Card", count: 2, duration: "3f" },
      sources: { title: "explicit", count: "default", duration: "default" },
    });
    expect(() => bindTemplateProps(template, { title: "Card", extra: true })).toThrow(
      "schema 未声明",
    );
  });

  test("节点类型强制原生 boolean、对象 props 与 keyframes", () => {
    const video = <Video id="v" duration="1s" src="v.mp4" sourceIn="0f"
      fit="cover" audio={false} x={1} y={1} width={1} height={1} layer={1} />;
    const layer = <ReactLayer id="r" duration="1s" component="Card.tsx"
      exportName="Card" props={{ count: 2, enabled: true }}
      x={1} y={1} width={1} height={1} layer={1} />;
    const transform = <Transform id="t" duration="1s" fill="both" easing="linear"
      keyframes={[
        { offset: 0, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0 },
        { offset: 1, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
      ]} />;
    const text = <Text id="text" duration="1s" role="body" content="typed"
      x={1} y={1} width={1} height={1} layer={1} font="Inter" fontSize={12}
      lineHeight={1.2} color="#fff" align="left" />;
    expect([video, layer, transform, text].map(readProjectElement).map((item) => item?.tag))
      .toEqual(["video", "react", "transform", "text"]);

    // @ts-expect-error audio 使用 boolean，不接受旧式字符串值。
    const invalidAudio = <Video id="bad" duration="1s" src="v.mp4" sourceIn="0f" fit="cover" audio="off" x={1} y={1} width={1} height={1} layer={1} />;
    // @ts-expect-error props 必须是对象。
    const invalidProps = <ReactLayer id="bad" duration="1s" component="Card.tsx" props="count=2" x={1} y={1} width={1} height={1} layer={1} />;
    expect(invalidAudio).toBeDefined();
    expect(invalidProps).toBeDefined();
  });
});
