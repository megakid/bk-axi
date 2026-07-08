import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/bk.js", () => ({
  bkJson: vi.fn(),
}));

import { bkJson } from "../src/bk.js";
import { pipelineCommand } from "../src/commands/pipeline.js";

const mockedBkJson = vi.mocked(bkJson);

describe("pipelineCommand", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists pipelines with a compact schema", async () => {
    mockedBkJson.mockResolvedValue([
      {
        slug: "api",
        name: "API",
        repository: "git@github.com:acme/api.git",
      },
    ]);

    const output = await pipelineCommand(["list", "--name", "api"]);

    expect(mockedBkJson).toHaveBeenCalledWith([
      "pipeline",
      "list",
      "--json",
      "--limit",
      "100",
      "--name",
      "api",
    ]);
    expect(output).toContain("pipelines[1]");
    expect(output).toContain("api");
  });

  it("views a pipeline as detail output", async () => {
    mockedBkJson.mockResolvedValue({
      slug: "api",
      name: "API",
      repository: "git@github.com:acme/api.git",
      description: "deploy pipeline",
    });

    const output = await pipelineCommand(["view", "api"]);

    expect(mockedBkJson).toHaveBeenCalledWith(["pipeline", "view", "--json", "api"]);
    expect(output).toContain("pipeline:");
    expect(output).toContain("deploy pipeline");
  });
});
