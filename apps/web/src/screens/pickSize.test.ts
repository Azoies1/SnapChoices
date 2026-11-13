import { describe, expect, it } from "vitest";
import { pickSize } from "./Pick";

describe("pickSize", () => {
  it("keeps short picks huge", () => {
    expect(pickSize("pizza")).toBe("text-7xl");
    expect(pickSize("gym")).toBe("text-7xl");
  });

  it("steps down for a long word even when the whole option is short", () => {
    // "headphones" split as "headphone / s" at 375 px in text-6xl.
    expect(pickSize("the Sony headphones")).toBe("text-5xl");
    expect(pickSize("croissant")).toBe("text-5xl");
    expect(pickSize("restaurant")).toBe("text-5xl");
  });

  it("steps down for long options", () => {
    expect(pickSize("the blue one by the window")).toBe("text-5xl");
    expect(pickSize("x ".repeat(30).trim())).toBe("text-4xl");
    expect(pickSize("supercalifragilistic")).toBe("text-3xl");
  });
});
