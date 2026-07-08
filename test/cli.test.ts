import { describe, expect, it, vi } from "vitest";

vi.mock("../src/bk.js", () => ({
  bkJson: vi.fn().mockResolvedValue([]),
  bkText: vi.fn(),
}));

import { runCli } from "../src/cli.js";

describe("runCli", () => {
  it("renders the content-first home view with no args", async () => {
    const result = await runCli([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("description:");
    expect(result.stdout).toContain("builds: 0 recent builds visible");
    expect(result.stdout).toContain("Run `bk-axi build list --pipeline <pipeline>`");
  });

  it("prints top-level help", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("usage: bk-axi");
  });

  it("returns structured usage errors on stdout", async () => {
    const result = await runCli(["build", "list", "--stat", "failed"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("error: unknown flag --stat");
    expect(result.stdout).toContain("valid flags");
  });

  it("shows targeted help for Buildkite retry terminology", async () => {
    const result = await runCli(["build", "retry", "42"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("build rebuild");
  });

  it("includes build wait in help for structured monitoring", async () => {
    const result = await runCli(["build", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("wait [number]");
    expect(result.stdout).toContain("blocked,passed,failed");
  });
});
