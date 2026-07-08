import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSkillMarkdown } from "../src/skill.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = join(root, "skills", "bk-axi", "SKILL.md");
const next = createSkillMarkdown();
const check = process.argv.includes("--check");

if (check) {
  const current = await readFile(skillPath, "utf8").catch(() => "");
  if (current !== next) {
    console.log("error: skills/bk-axi/SKILL.md is stale");
    console.log("help: run `npm run build:skill`");
    process.exitCode = 1;
  }
} else {
  await writeFile(skillPath, next, "utf8");
}
