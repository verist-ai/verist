import { describe, it, expect } from "bun:test";
import { ok, err, unwrap, map, isOk, isErr } from "./result.ts";

describe("Result", () => {
  it("ok creates success result", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("err creates error result", () => {
    const result = err(new Error("fail"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("fail");
    }
  });

  it("unwrap extracts value", () => {
    expect(unwrap(ok(42))).toBe(42);
  });

  it("unwrap throws on error", () => {
    expect(() => unwrap(err(new Error("fail")))).toThrow("fail");
  });

  it("map transforms success value", () => {
    const result = map(ok(2), (x) => x * 2);
    expect(unwrap(result)).toBe(4);
  });

  it("map passes through error", () => {
    const result = map(err(new Error("fail")), (x: number) => x * 2);
    expect(result.ok).toBe(false);
  });

  it("isOk/isErr type guards", () => {
    const success = ok(42);
    const failure = err(new Error("fail"));

    expect(isOk(success)).toBe(true);
    expect(isErr(success)).toBe(false);
    expect(isOk(failure)).toBe(false);
    expect(isErr(failure)).toBe(true);
  });
});
