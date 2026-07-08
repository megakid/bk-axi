import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/bk.js", () => ({
  bkJson: vi.fn(),
  bkText: vi.fn(),
}));

import { bkJson, bkText } from "../src/bk.js";
import { jobCommand } from "../src/commands/job.js";

const mockedBkJson = vi.mocked(bkJson);
const mockedBkText = vi.mocked(bkText);

describe("jobCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists blocked jobs with compact unblock fields", async () => {
    mockedBkJson.mockResolvedValue([
      {
        id: "job-manual",
        label: "Deploy",
        state: "blocked",
        unblockable: true,
      },
    ]);

    const output = await jobCommand(["list", "--state", "blocked", "--pipeline", "api"]);

    expect(mockedBkJson).toHaveBeenCalledWith([
      "job",
      "list",
      "--json",
      "--limit",
      "100",
      "--pipeline",
      "api",
      "--state",
      "blocked",
    ]);
    expect(output).toContain("jobs[1]");
    expect(output).toContain("job-manual");
    expect(output).toContain("bk-axi job unblock <job-id>");
  });

  it("wraps agent-formatted job logs in TOON", async () => {
    mockedBkText.mockResolvedValue("failure details");

    const output = await jobCommand(["log", "job-1", "--format", "markdown", "--max-tokens", "2000"]);

    expect(mockedBkText).toHaveBeenCalledWith([
      "job",
      "log",
      "job-1",
      "--agent",
      "--format",
      "markdown",
      "--max-tokens",
      "2000",
    ]);
    expect(output).toContain("job_log");
    expect(output).toContain("failure details");
  });

  it("rejects deprecated pipeline flags for job logs", async () => {
    await expect(jobCommand(["log", "job-1", "--pipeline", "api"])).rejects.toThrow("job IDs are globally resolvable");
    expect(mockedBkText).not.toHaveBeenCalled();
  });

  it("retries jobs with confirmation suppressed", async () => {
    mockedBkText.mockResolvedValue("retried");

    const output = await jobCommand(["retry", "job-1"]);

    expect(mockedBkText).toHaveBeenCalledWith(["job", "retry", "job-1"], { yes: true });
    expect(output).toContain("retry");
  });

  it("unblocks jobs with normalized JSON data", async () => {
    mockedBkText.mockResolvedValue("unblocked");

    const output = await jobCommand(["unblock", "job-1", "--data", "{ \"release\": \"staging\" }"]);

    expect(mockedBkText).toHaveBeenCalledWith([
      "job",
      "unblock",
      "job-1",
      "--data",
      "{\"release\":\"staging\"}",
    ], { yes: true });
    expect(output).toContain("unblocked");
    expect(output).toContain("data: provided");
  });

  it("rejects invalid unblock JSON before calling bk", async () => {
    await expect(jobCommand(["unblock", "job-1", "--data", "{"])).rejects.toThrow("--data must be valid JSON");
    expect(mockedBkText).not.toHaveBeenCalled();
  });
});
