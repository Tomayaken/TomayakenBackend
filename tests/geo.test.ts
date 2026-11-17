import { describe, expect, it } from "vitest";
import { distanceMeters } from "../src/lib/geo.js";

describe("distanceMeters（ハーバーサイン公式）", () => {
  it("同じ地点なら 0", () => {
    const p = { latitude: 35.6812, longitude: 139.7671 };
    expect(distanceMeters(p, p)).toBe(0);
  });

  it("赤道上の経度1度は約111.2km（2πR / 360）", () => {
    const d = distanceMeters(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
    );
    expect(d).toBeCloseTo((2 * Math.PI * 6_371_000) / 360, 3);
  });

  it("北極から南極までは半周（πR）", () => {
    const d = distanceMeters(
      { latitude: 90, longitude: 0 },
      { latitude: -90, longitude: 0 },
    );
    expect(d).toBeCloseTo(Math.PI * 6_371_000, 3);
  });

  it("経度180度をまたいでも近い2点は近い", () => {
    const d = distanceMeters(
      { latitude: 0, longitude: 179.999 },
      { latitude: 0, longitude: -179.999 },
    );
    expect(d).toBeLessThan(300);
  });

  it("向きを入れ替えても同じ距離", () => {
    const a = { latitude: 35.6812, longitude: 139.7671 };
    const b = { latitude: 35.6905, longitude: 139.7004 };
    expect(distanceMeters(a, b)).toBe(distanceMeters(b, a));
  });
});
