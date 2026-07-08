import { describe, expect, it } from "vitest";
import { createSkillMarkdown, extractCommandsBlock } from "../src/skill.js";

describe("skill generation", () => {
  it("extracts the command block from top-level help", () => {
    expect(extractCommandsBlock()).toContain("build, job, pipeline");
  });

  it("creates a static skill with npx-safe commands", () => {
    const markdown = createSkillMarkdown();
    expect(markdown).toContain("name: bk-axi");
    expect(markdown).toContain("npx -y bk-axi");
    expect(markdown).toContain("Buildkite does not have `build retry`");
    expect(markdown).toContain("build wait");
    expect(markdown).toContain("job unblock");
  });
});
