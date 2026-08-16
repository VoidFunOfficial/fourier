import { describe, expect, test } from "bun:test";
import { createPhy2dWorld, type Phy2dWorld } from "../src/phy2d.ts";

function populatedWorld(): Phy2dWorld {
  const world = createPhy2dWorld({
    width: 640,
    height: 360,
    damping: 0.96,
    solverIterations: 7,
  });
  world.addSoftBody({ center: { x: 265, y: 180 }, radius: 115, particleCount: 18 });
  world.addSoftBody({ center: { x: 375, y: 180 }, radius: 115, particleCount: 18 });
  return world;
}

describe("Phy2D position-based soft-body world", () => {
  test("is deterministic for identical inputs and absolute step sequences", () => {
    const first = populatedWorld();
    const second = populatedWorld();
    for (let step = 0; step < 24; step += 1) {
      const options = {
        bodyAccelerations: [
          { x: 0.12, y: Math.sin(step * 0.2) * 0.05 },
          { x: -0.12, y: Math.cos(step * 0.2) * 0.05 },
        ],
        collisionRelaxation: 0.44,
      } as const;
      first.step(options);
      second.step(options);
    }
    expect(first.snapshot()).toEqual(second.snapshot());
  });

  test("keeps particles inside walls while pressure and collisions deform membranes", () => {
    const world = populatedWorld();
    for (let step = 0; step < 36; step += 1) world.step();
    const snapshot = world.snapshot();
    expect(snapshot.step).toBe(36);
    expect(snapshot.bodies).toHaveLength(2);

    for (const body of snapshot.bodies) {
      expect(body.area).toBeGreaterThan(body.restArea * 0.35);
      for (const particle of body.particles) {
        expect(particle.x).toBeGreaterThanOrEqual(0);
        expect(particle.x).toBeLessThanOrEqual(640);
        expect(particle.y).toBeGreaterThanOrEqual(0);
        expect(particle.y).toBeLessThanOrEqual(360);
      }
      const radii = body.particles.map((particle) => Math.hypot(
        particle.x - body.center.x,
        particle.y - body.center.y,
      ));
      expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(3.5);
    }
  });

  test("rejects invalid world and membrane configuration", () => {
    expect(() => createPhy2dWorld({ width: 0, height: 100 })).toThrow(
      expect.objectContaining({ code: "INVALID_PHY2D_CONFIG" }),
    );
    const world = createPhy2dWorld({ width: 100, height: 100 });
    expect(() => world.addSoftBody({
      center: { x: 50, y: 50 },
      radius: 20,
      particleCount: 5,
    })).toThrow(expect.objectContaining({ code: "INVALID_PHY2D_CONFIG" }));
    expect(() => world.step({ targetStructureScale: 0 })).toThrow(
      expect.objectContaining({ code: "INVALID_PHY2D_CONFIG" }),
    );
  });

  test("contracts spring structure and pressure into a tiny physical body", () => {
    const world = createPhy2dWorld({ width: 640, height: 360, solverIterations: 8 });
    world.addSoftBody({ center: { x: 320, y: 180 }, radius: 110, particleCount: 18 });
    const initialArea = world.snapshot().bodies[0]!.area;
    for (let step = 0; step < 48; step += 1) {
      world.step({
        targetStructureScale: 0.05,
        targetAreaScale: 0.0025,
        collisionRelaxation: 0,
      });
    }
    expect(world.snapshot().bodies[0]!.area).toBeLessThan(initialArea * 0.012);
  });
});
