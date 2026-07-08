import { describe, expect, it } from "vitest";
import { AxiError } from "../src/errors.js";
import { parseArgs } from "../src/args.js";

describe("parseArgs", () => {
  const specs = [
    { name: "--state", short: "-s", takesValue: true },
    { name: "--limit", takesValue: true },
    { name: "--mine" },
  ];

  it("parses long, equals, short, and boolean flags", () => {
    const parsed = parseArgs("build list", [
      "--state=failed",
      "-s",
      "passed",
      "--limit",
      "20",
      "--mine",
      "extra",
    ], specs);

    expect(parsed.values.get("--state")).toBe("passed");
    expect(parsed.values.get("--limit")).toBe("20");
    expect(parsed.bools.has("--mine")).toBe(true);
    expect(parsed.positionals).toEqual(["extra"]);
  });

  it("rejects unknown flags with valid flag help", () => {
    expect(() => parseArgs("build list", ["--stat", "failed"], specs)).toThrow(AxiError);
    try {
      parseArgs("build list", ["--stat", "failed"], specs);
    } catch (error) {
      expect((error as AxiError).message).toContain("unknown flag --stat");
      expect((error as AxiError).suggestions[0]).toContain("--state");
    }
  });

  it("rejects missing flag values before dependencies run", () => {
    expect(() => parseArgs("build list", ["--state"], specs)).toThrow("Missing value for --state");
  });
});
