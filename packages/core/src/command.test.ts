// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "bun:test";
import {
  CommandSchema,
  emit,
  fanout,
  invoke,
  isBlockingCommand,
  isControlCommand,
  isSideEffectCommand,
  review,
  suspend,
  SuspendCommandSchema,
} from "./command.ts";

describe("Command helpers", () => {
  it("invoke creates correct command", () => {
    const cmd = invoke("nextStep", { id: 123 });
    expect(cmd).toEqual({
      type: "invoke",
      step: "nextStep",
      input: { id: 123 },
    });
    expect(CommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("fanout creates correct command", () => {
    const cmd = fanout("processItem", [{ id: 1 }, { id: 2 }]);
    expect(cmd).toEqual({
      type: "fanout",
      step: "processItem",
      inputs: [{ id: 1 }, { id: 2 }],
    });
    expect(CommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("review creates correct command", () => {
    const cmd = review("needs human verification", { claimId: "c-1" });
    expect(cmd).toEqual({
      type: "review",
      reason: "needs human verification",
      payload: { claimId: "c-1" },
    });
    expect(CommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("emit creates correct command", () => {
    const cmd = emit("document.verified", { docId: "d-1", score: 0.95 });
    expect(cmd).toEqual({
      type: "emit",
      topic: "document.verified",
      payload: { docId: "d-1", score: 0.95 },
    });
    expect(CommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("suspend creates correct command", () => {
    const cmd = suspend({
      reason: "awaiting_documentation",
      checkpoint: { claimId: "c-1", requestedDocType: "financial" },
      resumeStep: "handleDocumentation",
    });
    expect(cmd).toEqual({
      type: "suspend",
      reason: "awaiting_documentation",
      checkpoint: { claimId: "c-1", requestedDocType: "financial" },
      resumeStep: "handleDocumentation",
    });
    expect(CommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("suspend works without resumeStep", () => {
    const cmd = suspend({
      reason: "awaiting_callback",
      checkpoint: { webhookId: "wh-1" },
    });
    expect(cmd).toEqual({
      type: "suspend",
      reason: "awaiting_callback",
      checkpoint: { webhookId: "wh-1" },
    });
    expect(CommandSchema.parse(cmd)).toEqual(cmd);
  });

  it("schema rejects unknown keys", () => {
    const cmd = { type: "invoke", step: "test", input: {}, extra: "field" };
    expect(() => CommandSchema.parse(cmd)).toThrow();
  });

  it("individual schema rejects unknown keys", () => {
    const cmd = {
      type: "suspend",
      reason: "test",
      checkpoint: {},
      extra: "field",
    };
    expect(() => SuspendCommandSchema.parse(cmd)).toThrow();
  });
});

describe("Command category helpers", () => {
  describe("isBlockingCommand", () => {
    it("returns true for review command", () => {
      const cmd = review("needs approval");
      expect(isBlockingCommand(cmd)).toBe(true);
    });

    it("returns true for suspend command", () => {
      const cmd = suspend({ reason: "awaiting", checkpoint: {} });
      expect(isBlockingCommand(cmd)).toBe(true);
    });

    it("returns false for invoke command", () => {
      const cmd = invoke("step", {});
      expect(isBlockingCommand(cmd)).toBe(false);
    });

    it("returns false for fanout command", () => {
      const cmd = fanout("step", []);
      expect(isBlockingCommand(cmd)).toBe(false);
    });

    it("returns false for emit command", () => {
      const cmd = emit("topic", {});
      expect(isBlockingCommand(cmd)).toBe(false);
    });
  });

  describe("isControlCommand", () => {
    it("returns true for invoke command", () => {
      const cmd = invoke("step", {});
      expect(isControlCommand(cmd)).toBe(true);
    });

    it("returns true for fanout command", () => {
      const cmd = fanout("step", []);
      expect(isControlCommand(cmd)).toBe(true);
    });

    it("returns false for review command", () => {
      const cmd = review("needs approval");
      expect(isControlCommand(cmd)).toBe(false);
    });

    it("returns false for suspend command", () => {
      const cmd = suspend({ reason: "awaiting", checkpoint: {} });
      expect(isControlCommand(cmd)).toBe(false);
    });

    it("returns false for emit command", () => {
      const cmd = emit("topic", {});
      expect(isControlCommand(cmd)).toBe(false);
    });
  });

  describe("isSideEffectCommand", () => {
    it("returns true for emit command", () => {
      const cmd = emit("topic", {});
      expect(isSideEffectCommand(cmd)).toBe(true);
    });

    it("returns false for invoke command", () => {
      const cmd = invoke("step", {});
      expect(isSideEffectCommand(cmd)).toBe(false);
    });

    it("returns false for fanout command", () => {
      const cmd = fanout("step", []);
      expect(isSideEffectCommand(cmd)).toBe(false);
    });

    it("returns false for review command", () => {
      const cmd = review("needs approval");
      expect(isSideEffectCommand(cmd)).toBe(false);
    });

    it("returns false for suspend command", () => {
      const cmd = suspend({ reason: "awaiting", checkpoint: {} });
      expect(isSideEffectCommand(cmd)).toBe(false);
    });
  });
});
