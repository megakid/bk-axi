import {
  get,
  parseArgs,
  positiveInt,
  rejectExtraPositionals,
  type FlagSpec,
} from "../args.js";
import { bkJson } from "../bk.js";
import { AxiError } from "../errors.js";
import { parseFields, type ExtraFieldSpec } from "../fields.js";
import { oneLine } from "../format.js";
import { asArray, readPath, type JsonObject } from "../json.js";
import {
  countLine,
  custom,
  renderDetail,
  renderHelp,
  renderList,
  renderOutput,
  truncateText,
  type FieldDef,
} from "../toon.js";
import { maybeMoreHint } from "../suggestions.js";

export const PIPELINE_HELP = `usage: bk-axi pipeline <subcommand> [args] [flags]
subcommands[2]:
  list, view [pipeline]
flags{list}:
  --org, -n/--name, -r/--repository, -l/--limit (default 100), --fields <a,b,c>
flags{view}:
  --org, -p/--pipeline, --full
examples:
  bk-axi pipeline list --name deploy
  bk-axi pipeline view my-pipeline
  bk-axi pipeline view my-org/my-pipeline`;

const listFlags: FlagSpec[] = [
  { name: "--org", takesValue: true },
  { name: "--name", short: "-n", takesValue: true },
  { name: "--repository", short: "-r", takesValue: true },
  { name: "--limit", short: "-l", takesValue: true },
  { name: "--fields", takesValue: true },
];

const viewFlags: FlagSpec[] = [
  { name: "--org", takesValue: true },
  { name: "--pipeline", short: "-p", takesValue: true },
  { name: "--full" },
];

const pipelineListSchema: FieldDef[] = [
  custom("slug", (item) => readPath(item, ["slug", "id"])),
  custom("name", (item) => readPath(item, ["name"])),
  custom("repository", (item) => oneLine(readPath(item, ["repository", "repository_url", "repo"]), 80)),
];

const pipelineListExtras: Record<string, ExtraFieldSpec> = {
  url: { def: custom("url", (item) => readPath(item, ["web_url", "url"])) },
  branch: { def: custom("branch", (item) => readPath(item, ["default_branch", "defaultBranch"])) },
  description: { def: custom("description", (item) => oneLine(readPath(item, ["description"]), 100)) },
};

const pipelineDetailSchema: FieldDef[] = [
  custom("slug", (item) => readPath(item, ["slug", "id"])),
  custom("name", (item) => readPath(item, ["name"])),
  custom("repository", (item) => readPath(item, ["repository", "repository_url", "repo"])),
  custom("branch", (item) => readPath(item, ["default_branch", "defaultBranch"])),
  custom("description", (item) => truncateText(readPath(item, ["description"]), 1200).text),
  custom("url", (item) => readPath(item, ["web_url", "url"])),
];

export async function pipelineCommand(args: string[]): Promise<string> {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    return PIPELINE_HELP;
  }
  switch (subcommand) {
    case "list":
    case "ls":
      return listPipelines(rest);
    case "view":
      return viewPipeline(rest);
    default:
      throw new AxiError(`Unknown pipeline subcommand: ${subcommand}`, "VALIDATION_ERROR", [
        "Run `bk-axi pipeline --help`",
      ]);
  }
}

async function listPipelines(args: string[]): Promise<string> {
  const parsed = parseArgs("pipeline list", args, listFlags);
  rejectExtraPositionals(parsed, 0, "pipeline list");
  const limit = positiveInt(get(parsed, "--limit") ?? "100", "--limit");
  const fields = parseFields(get(parsed, "--fields"), pipelineListExtras);
  const bkArgs = ["pipeline", "list", "--json", "--limit", String(limit)];
  appendValue(bkArgs, parsed, "--org");
  appendValue(bkArgs, parsed, "--name");
  appendValue(bkArgs, parsed, "--repository");
  const pipelines = asArray(await bkJson(bkArgs));
  if (pipelines.length === 0) {
    return renderOutput([
      "pipelines: 0 pipelines found",
      renderHelp(["Run `bk-axi pipeline list --limit <n>` to broaden the search"]),
    ]);
  }
  return renderOutput([
    countLine(pipelines.length, limit),
    renderList("pipelines", pipelines, [...pipelineListSchema, ...fields]),
    renderHelp([
      ...maybeMoreHint("bk-axi pipeline list", pipelines.length, limit),
      "Run `bk-axi pipeline view <pipeline>` for details",
      "Run `bk-axi build list --pipeline <pipeline>` for recent builds",
    ]),
  ]);
}

async function viewPipeline(args: string[]): Promise<string> {
  const parsed = parseArgs("pipeline view", args, viewFlags);
  rejectExtraPositionals(parsed, 1, "pipeline view");
  const bkArgs = ["pipeline", "view", "--json"];
  if (parsed.positionals[0]) {
    bkArgs.push(parsed.positionals[0]);
  }
  appendValue(bkArgs, parsed, "--org");
  appendValue(bkArgs, parsed, "--pipeline");
  const pipeline = await bkJson<JsonObject>(bkArgs);
  return renderDetail("pipeline", pipeline, pipelineDetailSchema);
}

function appendValue(args: string[], parsed: ReturnType<typeof parseArgs>, name: string): void {
  const value = get(parsed, name);
  if (value !== undefined) {
    args.push(name, value);
  }
}
