import { encode } from "@toon-format/toon";
import { bkJson } from "../bk.js";
import { DESCRIPTION } from "../constants.js";
import { currentExecutable } from "../format.js";
import { asArray } from "../json.js";
import { custom, renderHelp, renderList, renderOutput, type FieldDef } from "../toon.js";
import { oneLine } from "../format.js";
import { readPath } from "../json.js";

const buildSchema: FieldDef[] = [
  custom("number", (item) => readPath(item, ["number", "build_number", "buildNumber"])),
  custom("pipeline", (item) => readPath(item, ["pipeline.slug", "pipeline.name", "pipeline", "pipeline_slug"])),
  custom("state", (item) => readPath(item, ["state", "status"])),
  custom("title", (item) => oneLine(readPath(item, ["message", "title"]), 60)),
];

const pipelineSchema: FieldDef[] = [
  custom("slug", (item) => readPath(item, ["slug", "id"])),
  custom("name", (item) => readPath(item, ["name"])),
  custom("repository", (item) => oneLine(readPath(item, ["repository", "repository_url", "repo"]), 60)),
];

export async function homeCommand(_args: string[]): Promise<string> {
  const [builds, pipelines] = await Promise.all([
    bkJson(["build", "list", "--json", "--limit", "5"]).then(asArray).catch(() => []),
    bkJson(["pipeline", "list", "--json", "--limit", "5"]).then(asArray).catch(() => []),
  ]);

  const blocks = [
    encode({ bin: currentExecutable(), description: DESCRIPTION }),
    builds.length > 0 ? renderList("builds", builds, buildSchema) : "builds: 0 recent builds visible",
    pipelines.length > 0 ? renderList("pipelines", pipelines, pipelineSchema) : "pipelines: 0 pipelines visible",
    renderHelp([
      "Run `bk-axi build list --pipeline <pipeline>` for recent builds",
      "Run `bk-axi build view <number> --pipeline <pipeline>` to inspect jobs",
      "Run `bk-axi pipeline list` to discover pipeline slugs",
      "Run `bk-axi auth status` to verify authentication",
    ]),
  ];
  return renderOutput(blocks);
}
