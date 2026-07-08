import { encode } from "@toon-format/toon";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  get,
  has,
  parseArgs,
  positiveInt,
  rejectExtraPositionals,
  requirePositional,
  type FlagSpec,
} from "../args.js";
import { bkJson, bkText } from "../bk.js";
import { parseFields, type ExtraFieldSpec } from "../fields.js";
import { AxiError } from "../errors.js";
import { oneLine } from "../format.js";
import { asArray, readPath, type JsonObject } from "../json.js";
import {
  countLine,
  custom,
  renderHelp,
  renderList,
  renderOutput,
  type FieldDef,
} from "../toon.js";
import { maybeMoreHint } from "../suggestions.js";

export const JOB_HELP = `usage: bk-axi job <subcommand> [args] [flags]
subcommands[5]:
  list, log <job-id>, unblock <job-id>, retry <job-id>, cancel <job-id>
flags{list}:
  -p/--pipeline, --state, --queue, --since, --until, --duration, --order-by, --limit (default 100), --no-limit, --fields <a,b,c>
flags{log}:
  --no-timestamps, --format <plain|markdown> (default plain), --max-tokens (default 4000), --max-chars (default 20000), --no-window, --full
flags{unblock}:
  --data <json>, --data-file <path>
flags{cancel}:
  none
examples:
  bk-axi job list --state blocked --pipeline api
  bk-axi job log 0190046e-e199-453b-a302-a21a4d649d31
  bk-axi job unblock <job-id> --data '{"release":"staging"}'
  bk-axi job log <job-id> --format markdown --max-tokens 2000
  bk-axi job retry <job-id>`;

const listFlags: FlagSpec[] = [
  { name: "--pipeline", short: "-p", takesValue: true },
  { name: "--state", takesValue: true },
  { name: "--queue", takesValue: true },
  { name: "--since", takesValue: true },
  { name: "--until", takesValue: true },
  { name: "--duration", takesValue: true },
  { name: "--order-by", takesValue: true },
  { name: "--limit", takesValue: true },
  { name: "--no-limit" },
  { name: "--fields", takesValue: true },
];

const logFlags: FlagSpec[] = [
  { name: "--no-timestamps" },
  { name: "--format", takesValue: true },
  { name: "--max-tokens", takesValue: true },
  { name: "--max-chars", takesValue: true },
  { name: "--no-window" },
  { name: "--full" },
  { name: "--pipeline", takesValue: true, renamedTo: "<remove it; job IDs are globally resolvable>" },
  { name: "--build-number", takesValue: true, renamedTo: "<remove it; job IDs are globally resolvable>" },
];

const unblockFlags: FlagSpec[] = [
  { name: "--data", takesValue: true },
  { name: "--data-file", takesValue: true },
];

const emptyFlags: FlagSpec[] = [];

const jobListSchema: FieldDef[] = [
  custom("id", (item) => readPath(item, ["id", "uuid", "job_id"])),
  custom("label", (item) => oneLine(readPath(item, ["label", "name", "command"]), 80)),
  custom("state", (item) => readPath(item, ["state", "status"])),
  custom("unblockable", (item) => readPath(item, ["unblockable"])),
];

const jobListExtras: Record<string, ExtraFieldSpec> = {
  type: { def: custom("type", (item) => readPath(item, ["type"])) },
  build: { def: custom("build", jobBuildNumber) },
  pipeline: { def: custom("pipeline", jobPipelineSlug) },
  queue: { def: custom("queue", (item) => readPath(item, ["queue", "agent_query_rules"])) },
  url: { def: custom("url", (item) => readPath(item, ["web_url", "unblock_url"])) },
};

export async function jobCommand(args: string[]): Promise<string> {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    return JOB_HELP;
  }
  switch (subcommand) {
    case "list":
    case "ls":
      return jobList(rest);
    case "log":
      return jobLog(rest);
    case "unblock":
      return jobUnblock(rest);
    case "retry":
      return jobMutation("retry", rest);
    case "cancel":
      return jobMutation("cancel", rest);
    default:
      throw new AxiError(`Unknown job subcommand: ${subcommand}`, "VALIDATION_ERROR", [
        "Run `bk-axi job --help`",
      ]);
  }
}

async function jobList(args: string[]): Promise<string> {
  const parsed = parseArgs("job list", args, listFlags);
  rejectExtraPositionals(parsed, 0, "job list");
  const limit = positiveInt(get(parsed, "--limit") ?? "100", "--limit");
  const fields = parseFields(get(parsed, "--fields"), jobListExtras);
  const bkArgs = ["job", "list", "--json"];
  if (has(parsed, "--no-limit")) {
    bkArgs.push("--no-limit");
  } else {
    bkArgs.push("--limit", String(limit));
  }
  appendValue(bkArgs, parsed, "--pipeline");
  appendValue(bkArgs, parsed, "--state");
  appendValue(bkArgs, parsed, "--queue");
  appendValue(bkArgs, parsed, "--since");
  appendValue(bkArgs, parsed, "--until");
  appendValue(bkArgs, parsed, "--duration");
  appendValue(bkArgs, parsed, "--order-by");
  const jobs = asArray(await bkJson(bkArgs));
  if (jobs.length === 0) {
    return renderOutput([
      "jobs: 0 jobs found",
      renderHelp(["Run `bk-axi job list --state blocked --pipeline <pipeline>` to search for unblock steps"]),
    ]);
  }
  return renderOutput([
    countLine(jobs.length, has(parsed, "--no-limit") ? undefined : limit),
    renderList("jobs", jobs, [...jobListSchema, ...fields]),
    renderHelp([
      ...(has(parsed, "--no-limit") ? [] : maybeMoreHint("bk-axi job list", jobs.length, limit)),
      "Run `bk-axi job unblock <job-id> --data '<json>'` to unblock a manual step",
      "Run `bk-axi job log <job-id>` to inspect a job log",
    ]),
  ]);
}

async function jobLog(args: string[]): Promise<string> {
  const parsed = parseArgs("job log", args, logFlags);
  rejectExtraPositionals(parsed, 1, "job log");
  const jobId = requirePositional(parsed, 0, "job id", "job log");
  const maxChars = positiveInt(get(parsed, "--max-chars") ?? "20000", "--max-chars");
  const format = get(parsed, "--format") ?? "plain";
  if (!["plain", "markdown"].includes(format)) {
    throw new AxiError("--format must be plain or markdown", "VALIDATION_ERROR", [
      "Run `bk-axi job log --help`",
    ]);
  }

  const bkArgs = ["job", "log", jobId, "--agent", "--format", format];
  if (has(parsed, "--full")) {
    bkArgs.push("--max-tokens", "0", "--no-window");
  } else {
    bkArgs.push("--max-tokens", get(parsed, "--max-tokens") ?? "4000");
    if (has(parsed, "--no-window")) {
      bkArgs.push("--no-window");
    }
  }
  if (has(parsed, "--no-timestamps")) {
    bkArgs.push("--no-timestamps");
  }
  const output = await bkText(bkArgs);
  const truncated = output.length > maxChars;
  const payload: Record<string, unknown> = {
    job: jobId,
    format,
    output: truncated ? output.slice(-maxChars) : output,
    truncated,
  };
  if (!truncated) {
    return encode({ job_log: payload });
  }
  payload["original_length"] = output.length;
  const dir = await mkdtemp(join(tmpdir(), "bk-axi-logs-"));
  const file = join(dir, `${jobId.replace(/[^A-Za-z0-9_-]/g, "_")}.log`);
  await writeFile(file, output, { encoding: "utf8", mode: 0o600, flag: "wx" });
  payload["full_log"] = file;
  return renderOutput([
    encode({ job_log: payload }),
    renderHelp([`Output shows last ${maxChars} of ${output.length} chars; full log saved to ${file}`]),
  ]);
}

async function jobUnblock(args: string[]): Promise<string> {
  const parsed = parseArgs("job unblock", args, unblockFlags);
  rejectExtraPositionals(parsed, 1, "job unblock");
  const jobId = requirePositional(parsed, 0, "job id", "job unblock");
  const data = await unblockData(parsed);
  const bkArgs = ["job", "unblock", jobId];
  if (data !== undefined) {
    bkArgs.push("--data", data);
  }
  const output = await bkText(bkArgs, { yes: true });
  return renderOutput([
    encode({ job: { id: jobId, action: "unblocked", data: data !== undefined ? "provided" : "none", output: oneLine(output, 500) } }),
    renderHelp(["Run `bk-axi build wait <number> --pipeline <pipeline>` to monitor the build to its next blocked or terminal state"]),
  ]);
}

async function jobMutation(action: "retry" | "cancel", args: string[]): Promise<string> {
  const parsed = parseArgs(`job ${action}`, args, emptyFlags);
  rejectExtraPositionals(parsed, 1, `job ${action}`);
  const jobId = requirePositional(parsed, 0, "job id", `job ${action}`);
  const output = await bkText(["job", action, jobId], { yes: true });
  return renderOutput([
    encode({ job: { id: jobId, action, output: oneLine(output, 500) } }),
    action === "retry"
      ? renderHelp(["Run `bk-axi build view <number> --pipeline <pipeline>` to find the replacement job"])
      : "",
  ]);
}

function appendValue(args: string[], parsed: ReturnType<typeof parseArgs>, name: string): void {
  const value = get(parsed, name);
  if (value !== undefined) {
    args.push(name, value);
  }
}

async function unblockData(parsed: ReturnType<typeof parseArgs>): Promise<string | undefined> {
  const data = get(parsed, "--data");
  const dataFile = get(parsed, "--data-file");
  if (data !== undefined && dataFile !== undefined) {
    throw new AxiError("Pass only one of --data or --data-file", "VALIDATION_ERROR", [
      "Run `bk-axi job unblock <job-id> --data '<json>'`",
    ]);
  }
  const raw = dataFile !== undefined ? await readFile(dataFile, "utf8") : data;
  if (raw === undefined) {
    return undefined;
  }
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    throw new AxiError("--data must be valid JSON", "VALIDATION_ERROR", [
      "Run `bk-axi job unblock <job-id> --data '{\"field\":\"value\"}'`",
    ]);
  }
}

function jobBuildNumber(item: JsonObject): unknown {
  const direct = readPath(item, ["build.number", "build_number", "buildNumber"]);
  if (direct !== null) {
    return direct;
  }
  return parseJobUrl(item)?.build ?? null;
}

function jobPipelineSlug(item: JsonObject): unknown {
  const direct = readPath(item, ["pipeline.slug", "pipeline", "pipeline_slug"]);
  if (direct !== null) {
    return direct;
  }
  return parseJobUrl(item)?.pipeline ?? null;
}

function parseJobUrl(item: JsonObject): { pipeline: string; build: string } | null {
  const raw = readPath(item, ["build_url", "unblock_url", "log_url", "raw_log_url"]);
  if (typeof raw !== "string") {
    return null;
  }
  const match = raw.match(/\/pipelines\/([^/]+)\/builds\/([^/]+)/);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return { pipeline: match[1], build: match[2] };
}
