// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import { fail, isStepFailure } from "./fail.ts";

describe("fail", () => {
  it("creates StepFailure from code + message", () => {
    const f = fail("rate_limit", "Too many requests");
    expect(f._tag).toBe("StepFailure");
    expect(f.code).toBe("rate_limit");
    expect(f.message).toBe("Too many requests");
    expect(f.retryable).toBeUndefined();
  });

  it("creates StepFailure with retryable and cause", () => {
    const cause = new Error("original");
    const f = fail("timeout", "Timed out", { retryable: true, cause });
    expect(f.retryable).toBe(true);
    expect(f.cause).toBe(cause);
  });

  it("creates StepFailure from error object", () => {
    const f = fail({ code: "schema_error", message: "Bad", retryable: true });
    expect(f._tag).toBe("StepFailure");
    expect(f.code).toBe("schema_error");
    expect(f.message).toBe("Bad");
    expect(f.retryable).toBe(true);
  });

  it("preserves cause from error object", () => {
    const cause = new Error("upstream");
    const f = fail({ code: "llm_error", message: "Failed", cause });
    expect(f.cause).toBe(cause);
  });
});

describe("isStepFailure", () => {
  it("returns true for StepFailure", () => {
    expect(isStepFailure(fail("x", "y"))).toBe(true);
  });

  it("returns false for plain objects", () => {
    expect(isStepFailure({ code: "x", message: "y" })).toBe(false);
    expect(isStepFailure({ _tag: "Other" })).toBe(false);
    expect(isStepFailure({ _tag: "StepFailure" })).toBe(false);
    expect(isStepFailure({ _tag: "StepFailure", code: 123 })).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isStepFailure(null)).toBe(false);
    expect(isStepFailure(undefined)).toBe(false);
    expect(isStepFailure("string")).toBe(false);
    expect(isStepFailure(42)).toBe(false);
  });
});
