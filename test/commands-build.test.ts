import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/bk.js", () => ({
  bkJson: vi.fn(),
  bkText: vi.fn(),
}));

import { bkJson, bkText } from "../src/bk.js";
import { buildCommand } from "../src/commands/build.js";
import { AxiError } from "../src/errors.js";

const mockedBkJson = vi.mocked(bkJson);
const mockedBkText = vi.mocked(bkText);

describe("buildCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists builds with compact default fields and forwards filters", async () => {
    mockedBkJson.mockResolvedValue([
      {
        number: 42,
        pipeline: { slug: "api" },
        state: "failed",
        message: "CI failed on tests",
        branch: "main",
      },
    ]);

    const output = await buildCommand(["list", "--pipeline", "api", "--state", "failed"]);

    expect(mockedBkJson).toHaveBeenCalledWith([
      "build",
      "list",
      "--json",
      "--limit",
      "20",
      "--pipeline",
      "api",
      "--state",
      "failed",
    ]);
    expect(output).toContain("builds[1]");
    expect(output).toContain("CI failed on tests");
    expect(output).toContain("Run `bk-axi build view <number> --pipeline <pipeline>`");
  });

  it("adds requested extra fields", async () => {
    mockedBkJson.mockResolvedValue([
      {
        number: 42,
        pipeline: { slug: "api" },
        state: "passed",
        message: "ok",
        branch: "main",
      },
    ]);

    const output = await buildCommand(["list", "--fields", "branch"]);

    expect(output).toContain("branch");
    expect(output).toContain("main");
  });

  it("rejects unknown fields", async () => {
    await expect(buildCommand(["list", "--fields", "bogus"])).rejects.toThrow(AxiError);
    expect(mockedBkJson).not.toHaveBeenCalled();
  });

  it("uses Buildkite rebuild rather than retry", async () => {
    await expect(buildCommand(["retry", "42"])).rejects.toThrow("build rebuild");
  });

  it("creates builds non-interactively", async () => {
    mockedBkText.mockResolvedValue("https://buildkite.com/acme/api/builds/42");

    const output = await buildCommand([
      "create",
      "--pipeline",
      "api",
      "--branch",
      "main",
      "--message",
      "release",
    ]);

    expect(mockedBkText).toHaveBeenCalledWith([
      "build",
      "create",
      "--pipeline",
      "api",
      "--branch",
      "main",
      "--message",
      "release",
    ], { yes: true });
    expect(output).toContain("created");
    expect(output).toContain("https://buildkite.com/acme/api/builds/42");
  });

  it("shows blocked jobs and unblock guidance in build views", async () => {
    mockedBkJson.mockResolvedValue({
      number: 42,
      pipeline: { slug: "api" },
      state: "running",
      blocked: true,
      message: "deploy",
      jobs: [
        {
          id: "job-manual",
          label: "Deploy",
          state: "blocked",
          unblockable: true,
          unblock_url: "https://api.buildkite.com/v2/organizations/acme/pipelines/api/builds/42/jobs/job-manual/unblock",
        },
        {
          id: "job-test",
          name: "test",
          state: "passed",
          unblockable: false,
        },
      ],
    });

    const output = await buildCommand(["view", "42", "--pipeline", "api"]);

    expect(output).toContain("jobs_summary:");
    expect(output).toContain("blocked_jobs[1]");
    expect(output).toContain("job-manual");
    expect(output).toContain("bk-axi job unblock <job-id>");
  });

  it("waits until a build reaches a blocked job", async () => {
    mockedBkJson
      .mockResolvedValueOnce({
        number: 42,
        pipeline: { slug: "api" },
        state: "running",
        jobs: [{ id: "job-1", label: "test", state: "running" }],
      })
      .mockResolvedValueOnce({
        number: 42,
        pipeline: { slug: "api" },
        state: "running",
        blocked: true,
        jobs: [{ id: "job-2", label: "Deploy", state: "blocked", unblockable: true }],
      });

    const output = await buildCommand([
      "wait",
      "42",
      "--pipeline",
      "api",
      "--interval",
      "0",
      "--timeout",
      "5",
    ]);

    expect(mockedBkJson).toHaveBeenCalledTimes(2);
    expect(mockedBkJson).toHaveBeenLastCalledWith([
      "build",
      "view",
      "--json",
      "42",
      "--pipeline",
      "api",
    ]);
    expect(output).toContain("result: blocked");
    expect(output).toContain("blocked_jobs[1]");
  });

  it("wait returns passed as a terminal result", async () => {
    mockedBkJson.mockResolvedValue({
      number: 42,
      pipeline: { slug: "api" },
      state: "passed",
      jobs: [{ id: "job-1", label: "test", state: "passed" }],
    });

    const output = await buildCommand(["monitor", "42", "--pipeline", "api"]);

    expect(output).toContain("result: passed");
    expect(output).not.toContain("help[");
  });
});
