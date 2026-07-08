import { encode } from "@toon-format/toon";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  get,
  getAll,
  has,
  nonNegativeInt,
  parseArgs,
  positiveInt,
  rejectExtraPositionals,
  requirePositional,
  type FlagSpec,
} from "../args.js";
import { bkJson, bkText } from "../bk.js";
import { AxiError } from "../errors.js";
import { parseFields, type ExtraFieldSpec } from "../fields.js";
import { oneLine, relativeTime, shortSha } from "../format.js";
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
import { buildScope, maybeMoreHint } from "../suggestions.js";

export const BUILD_HELP = `usage: bk-axi build <subcommand> [args] [flags]
subcommands[8]:
  list, view [number], create, cancel <number>, rebuild [number], watch [number], wait [number], download [number]
flags{list}:
  -p/--pipeline, -s/--state, --branch, --creator, --commit, --message, --since, --until, --duration, --meta-data, --limit (default 20), --fields <a,b,c>
flags{view}:
  -p/--pipeline, -b/--branch, -u/--user, --mine, -s/--job-states, --full
flags{create}:
  -p/--pipeline, -b/--branch, -c/--commit (default HEAD), -m/--message, -a/--author, -e/--env, -M/--metadata, -f/--env-file, --ignore-branch-filters
flags{cancel}:
  -p/--pipeline
flags{rebuild}:
  -p/--pipeline, -b/--branch, -u/--user, --mine
flags{watch}:
  -p/--pipeline, -b/--branch, --interval, --max-chars (default 20000)
flags{wait}:
  -p/--pipeline, -b/--branch, -u/--user, --mine, -s/--job-states, --interval (default 10), --timeout (default 1800), --states (default blocked,passed,failed,canceled,skipped,broken)
examples:
  bk-axi build list --pipeline api --state failed
  bk-axi build view 42 --pipeline api
  bk-axi build wait 42 --pipeline api --interval 10 --timeout 1800
  bk-axi build create --pipeline api --branch main --message "release candidate"`;

const listFlags: FlagSpec[] = [
  { name: "--pipeline", short: "-p", takesValue: true },
  { name: "--state", short: "-s", takesValue: true },
  { name: "--branch", takesValue: true },
  { name: "--creator", takesValue: true },
  { name: "--commit", takesValue: true },
  { name: "--message", takesValue: true },
  { name: "--since", takesValue: true },
  { name: "--until", takesValue: true },
  { name: "--duration", takesValue: true },
  { name: "--meta-data", takesValue: true, repeatable: true },
  { name: "--limit", takesValue: true },
  { name: "--fields", takesValue: true },
];

const viewFlags: FlagSpec[] = [
  { name: "--pipeline", short: "-p", takesValue: true },
  { name: "--branch", short: "-b", takesValue: true },
  { name: "--user", short: "-u", takesValue: true },
  { name: "--mine" },
  { name: "--job-states", short: "-s", takesValue: true },
  { name: "--full" },
];

const createFlags: FlagSpec[] = [
  { name: "--pipeline", short: "-p", takesValue: true },
  { name: "--branch", short: "-b", takesValue: true },
  { name: "--commit", short: "-c", takesValue: true },
  { name: "--message", short: "-m", takesValue: true },
  { name: "--author", short: "-a", takesValue: true },
  { name: "--env", short: "-e", takesValue: true, repeatable: true },
  { name: "--metadata", short: "-M", takesValue: true, repeatable: true },
  { name: "--env-file", short: "-f", takesValue: true },
  { name: "--ignore-branch-filters" },
];

const cancelFlags: FlagSpec[] = [
  { name: "--pipeline", short: "-p", takesValue: true },
];

const rebuildFlags: FlagSpec[] = [
  { name: "--pipeline", short: "-p", takesValue: true },
  { name: "--branch", short: "-b", takesValue: true },
  { name: "--user", short: "-u", takesValue: true },
  { name: "--mine" },
];

const watchFlags: FlagSpec[] = [
  { name: "--pipeline", short: "-p", takesValue: true },
  { name: "--branch", short: "-b", takesValue: true },
  { name: "--interval", takesValue: true },
  { name: "--max-chars", takesValue: true },
];

const waitFlags: FlagSpec[] = [
  { name: "--pipeline", short: "-p", takesValue: true },
  { name: "--branch", short: "-b", takesValue: true },
  { name: "--user", short: "-u", takesValue: true },
  { name: "--mine" },
  { name: "--job-states", short: "-s", takesValue: true },
  { name: "--interval", takesValue: true },
  { name: "--timeout", takesValue: true },
  { name: "--states", takesValue: true },
];

const buildListSchema: FieldDef[] = [
  custom("number", buildNumber),
  custom("pipeline", pipelineName),
  custom("state", buildState),
  custom("title", (item) => oneLine(readPath(item, ["message", "title"]), 72)),
];

const buildListExtras: Record<string, ExtraFieldSpec> = {
  branch: { def: custom("branch", (item) => readPath(item, ["branch"])) },
  commit: { def: custom("commit", (item) => shortSha(readPath(item, ["commit", "commit.id", "commit.sha"]))) },
  created: { def: custom("created", (item) => relativeTime(readPath(item, ["created_at", "createdAt", "created"]))) },
  creator: { def: custom("creator", (item) => readPath(item, ["creator.email", "creator.name", "creator.login", "author.email", "author.name"])) },
  duration: { def: custom("duration", (item) => readPath(item, ["duration", "duration_in_seconds"])) },
  url: { def: custom("url", (item) => readPath(item, ["web_url", "url"])) },
};

const buildDetailSchema: FieldDef[] = [
  custom("number", buildNumber),
  custom("pipeline", pipelineName),
  custom("state", buildState),
  custom("blocked", (item) => readPath(item, ["blocked"])),
  custom("branch", (item) => readPath(item, ["branch"])),
  custom("commit", (item) => shortSha(readPath(item, ["commit", "commit.id", "commit.sha"]))),
  custom("message", (item) => detailText(readPath(item, ["message", "title"]), 1200)),
  custom("url", (item) => readPath(item, ["web_url", "url"])),
];

const jobSchema: FieldDef[] = [
  custom("id", (item) => readPath(item, ["id", "uuid", "job_id"])),
  custom("label", (item) => oneLine(readPath(item, ["label", "name", "command"]), 80)),
  custom("state", (item) => readPath(item, ["state", "status"])),
  custom("unblockable", (item) => readPath(item, ["unblockable"])),
  custom("exit", (item) => readPath(item, ["exit_status", "exitStatus"])),
];

const blockedJobSchema: FieldDef[] = [
  custom("id", (item) => readPath(item, ["id", "uuid", "job_id"])),
  custom("label", (item) => oneLine(readPath(item, ["label", "name", "command"]), 80)),
  custom("unblockable", (item) => readPath(item, ["unblockable"])),
  custom("url", (item) => readPath(item, ["web_url", "unblock_url"])),
];

export async function buildCommand(args: string[]): Promise<string> {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    return BUILD_HELP;
  }

  switch (subcommand) {
    case "list":
    case "ls":
      return listBuilds(rest);
    case "view":
      return viewBuild(rest);
    case "create":
    case "new":
      return createBuild(rest);
    case "cancel":
      return cancelBuild(rest);
    case "rebuild":
      return rebuildBuild(rest);
    case "retry":
      throw new AxiError(
        "`bk build retry` does not exist; use `bk-axi build rebuild`",
        "VALIDATION_ERROR",
        ["Run `bk-axi build rebuild <number> --pipeline <pipeline>`"],
      );
    case "watch":
      return watchBuild(rest);
    case "wait":
    case "monitor":
      return waitBuild(rest);
    case "download":
      return downloadBuild(rest);
    default:
      throw new AxiError(`Unknown build subcommand: ${subcommand}`, "VALIDATION_ERROR", [
        "Run `bk-axi build --help`",
      ]);
  }
}

async function listBuilds(args: string[]): Promise<string> {
  const parsed = parseArgs("build list", args, listFlags);
  rejectExtraPositionals(parsed, 0, "build list");
  const limit = positiveInt(get(parsed, "--limit") ?? "20", "--limit");
  const fields = parseFields(get(parsed, "--fields"), buildListExtras);
  const bkArgs = ["build", "list", "--json", "--limit", String(limit)];
  appendValue(bkArgs, parsed, "--pipeline");
  appendValue(bkArgs, parsed, "--state");
  appendValue(bkArgs, parsed, "--branch");
  appendValue(bkArgs, parsed, "--creator");
  appendValue(bkArgs, parsed, "--commit");
  appendValue(bkArgs, parsed, "--message");
  appendValue(bkArgs, parsed, "--since");
  appendValue(bkArgs, parsed, "--until");
  appendValue(bkArgs, parsed, "--duration");
  appendRepeated(bkArgs, parsed, "--meta-data");

  const builds = asArray(await bkJson(bkArgs));
  if (builds.length === 0) {
    return renderOutput([
      "builds: 0 builds found",
      renderHelp(["Run `bk-axi build create --pipeline <pipeline> --branch <branch>` to start one"]),
    ]);
  }

  const pipeline = get(parsed, "--pipeline");
  const scope = pipeline ? buildScope({ pipeline }) : "";
  return renderOutput([
    countLine(builds.length, limit),
    renderList("builds", builds, [...buildListSchema, ...fields]),
    renderHelp([
      ...maybeMoreHint("bk-axi build list", builds.length, limit, scope),
      "Run `bk-axi build view <number> --pipeline <pipeline>` to inspect jobs",
      "Run `bk-axi build wait <number> --pipeline <pipeline>` to stop when blocked, passed, or failed",
      "Run `bk-axi job log <job-id>` to read a failing job log",
    ]),
  ]);
}

async function viewBuild(args: string[]): Promise<string> {
  const parsed = parseArgs("build view", args, viewFlags);
  rejectExtraPositionals(parsed, 1, "build view");
  const bkArgs = ["build", "view", "--json"];
  if (parsed.positionals[0]) {
    bkArgs.push(parsed.positionals[0]);
  }
  appendValue(bkArgs, parsed, "--pipeline");
  appendValue(bkArgs, parsed, "--branch");
  appendValue(bkArgs, parsed, "--user");
  appendValue(bkArgs, parsed, "--job-states");
  appendBool(bkArgs, parsed, "--mine");

  const build = await bkJson<JsonObject>(bkArgs);
  const jobs = asArray(readPath(build, ["jobs"]));
  const blockedJobs = jobs.filter(isBlockedJob);
  const blocks = [
    renderDetail("build", build, buildDetailSchema),
    encode({ jobs_summary: summarizeJobs(jobs) }),
  ];
  if (jobs.length > 0) {
    blocks.push(renderList("jobs", jobs, jobSchema));
  } else {
    blocks.push("jobs: 0 jobs found");
  }
  if (blockedJobs.length > 0) {
    blocks.push(renderList("blocked_jobs", blockedJobs, blockedJobSchema));
    blocks.push(renderHelp(["Run `bk-axi job unblock <job-id> --data '<json>'` to unblock a manual step"]));
  }
  const message = readPath(build, ["message", "title"]);
  const detail = detailText(message, 1200);
  if (typeof message === "string" && !has(parsed, "--full") && message.length > detail.length) {
    blocks.push(renderHelp(["Run `bk-axi build view <number> --full` to see the complete message"]));
  }
  return renderOutput(blocks);
}

async function createBuild(args: string[]): Promise<string> {
  const parsed = parseArgs("build create", args, createFlags);
  rejectExtraPositionals(parsed, 0, "build create");
  const bkArgs = ["build", "create"];
  appendValue(bkArgs, parsed, "--pipeline");
  appendValue(bkArgs, parsed, "--branch");
  appendValue(bkArgs, parsed, "--commit");
  appendValue(bkArgs, parsed, "--message");
  appendValue(bkArgs, parsed, "--author");
  appendValue(bkArgs, parsed, "--env-file");
  appendRepeated(bkArgs, parsed, "--env");
  appendRepeated(bkArgs, parsed, "--metadata");
  appendBool(bkArgs, parsed, "--ignore-branch-filters");
  const output = await bkText(bkArgs, { yes: true });
  return renderOutput([
    encode({
      build: {
        action: "created",
        output: oneLine(output, 500),
        url: extractUrl(output),
      },
    }),
    renderHelp(["Run `bk-axi build list --pipeline <pipeline>` to find the new build number"]),
  ]);
}

async function cancelBuild(args: string[]): Promise<string> {
  const parsed = parseArgs("build cancel", args, cancelFlags);
  rejectExtraPositionals(parsed, 1, "build cancel");
  const number = requirePositional(parsed, 0, "build number", "build cancel");
  const bkArgs = ["build", "cancel", number];
  appendValue(bkArgs, parsed, "--pipeline");
  const output = await bkText(bkArgs, { yes: true });
  return renderOutput([
    encode({ build: { number, action: "cancelled", output: oneLine(output, 500) } }),
    renderHelp(["Run `bk-axi build view <number> --pipeline <pipeline>` to confirm state"]),
  ]);
}

async function rebuildBuild(args: string[]): Promise<string> {
  const parsed = parseArgs("build rebuild", args, rebuildFlags);
  rejectExtraPositionals(parsed, 1, "build rebuild");
  const bkArgs = ["build", "rebuild"];
  if (parsed.positionals[0]) {
    bkArgs.push(parsed.positionals[0]);
  }
  appendValue(bkArgs, parsed, "--pipeline");
  appendValue(bkArgs, parsed, "--branch");
  appendValue(bkArgs, parsed, "--user");
  appendBool(bkArgs, parsed, "--mine");
  const output = await bkText(bkArgs, { yes: true });
  return renderOutput([
    encode({ build: { action: "rebuilt", output: oneLine(output, 500), url: extractUrl(output) } }),
    renderHelp(["Run `bk-axi build list --pipeline <pipeline>` to find the rebuilt build"]),
  ]);
}

async function watchBuild(args: string[]): Promise<string> {
  const parsed = parseArgs("build watch", args, watchFlags);
  rejectExtraPositionals(parsed, 1, "build watch");
  const maxChars = positiveInt(get(parsed, "--max-chars") ?? "20000", "--max-chars");
  const bkArgs = ["build", "watch"];
  if (parsed.positionals[0]) {
    bkArgs.push(parsed.positionals[0]);
  }
  appendValue(bkArgs, parsed, "--pipeline");
  appendValue(bkArgs, parsed, "--branch");
  appendValue(bkArgs, parsed, "--interval");
  const output = await bkText(bkArgs);
  const wrapped = await wrapLongOutput("build_watch", output, maxChars);
  return wrapped;
}

async function waitBuild(args: string[]): Promise<string> {
  const parsed = parseArgs("build wait", args, waitFlags);
  rejectExtraPositionals(parsed, 1, "build wait");
  const intervalSeconds = nonNegativeInt(get(parsed, "--interval") ?? "10", "--interval");
  const timeoutSeconds = nonNegativeInt(get(parsed, "--timeout") ?? "1800", "--timeout");
  const desiredStates = parseStateSet(get(parsed, "--states") ?? "blocked,passed,failed,canceled,skipped,broken");
  const startedAt = Date.now();
  let attempts = 0;

  while (true) {
    attempts++;
    const build = await fetchBuildForWait(parsed);
    const jobs = asArray(readPath(build, ["jobs"]));
    const result = monitorResult(build, jobs, desiredStates);
    if (result !== undefined) {
      return renderBuildMonitor(build, jobs, result, attempts, startedAt, false);
    }

    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    if (timeoutSeconds === 0 || elapsedSeconds >= timeoutSeconds) {
      return renderBuildMonitor(build, jobs, "timeout", attempts, startedAt, true);
    }

    if (intervalSeconds > 0) {
      await delay(Math.min(intervalSeconds, timeoutSeconds - elapsedSeconds) * 1000);
    }
  }
}

async function downloadBuild(args: string[]): Promise<string> {
  const parsed = parseArgs("build download", args, rebuildFlags);
  rejectExtraPositionals(parsed, 1, "build download");
  const bkArgs = ["build", "download"];
  if (parsed.positionals[0]) {
    bkArgs.push(parsed.positionals[0]);
  }
  appendValue(bkArgs, parsed, "--pipeline");
  appendValue(bkArgs, parsed, "--branch");
  appendValue(bkArgs, parsed, "--user");
  appendBool(bkArgs, parsed, "--mine");
  const output = await bkText(bkArgs);
  return encode({ build_download: { output: oneLine(output, 1000) } });
}

function appendValue(args: string[], parsed: ReturnType<typeof parseArgs>, name: string): void {
  const value = get(parsed, name);
  if (value !== undefined) {
    args.push(name, value);
  }
}

function appendRepeated(args: string[], parsed: ReturnType<typeof parseArgs>, name: string): void {
  for (const value of getAll(parsed, name)) {
    args.push(name, value);
  }
}

function appendBool(args: string[], parsed: ReturnType<typeof parseArgs>, name: string): void {
  if (has(parsed, name)) {
    args.push(name);
  }
}

function buildNumber(item: JsonObject): unknown {
  return readPath(item, ["number", "build_number", "buildNumber"]);
}

function pipelineName(item: JsonObject): unknown {
  return readPath(item, ["pipeline.slug", "pipeline.name", "pipeline", "pipeline_slug"]);
}

function buildState(item: JsonObject): unknown {
  return readPath(item, ["state", "status"]);
}

function isBlockedJob(item: JsonObject): boolean {
  return String(readPath(item, ["state", "status"]) ?? "").toLowerCase() === "blocked";
}

function summarizeJobs(jobs: JsonObject[]): Record<string, number> {
  const summary: Record<string, number> = { total: jobs.length };
  for (const job of jobs) {
    const state = String(readPath(job, ["state", "status"]) ?? "unknown").toLowerCase();
    summary[state] = (summary[state] ?? 0) + 1;
  }
  return summary;
}

function parseStateSet(raw: string): Set<string> {
  return new Set(raw.split(",").map((state) => state.trim().toLowerCase()).filter(Boolean));
}

function monitorResult(
  build: JsonObject,
  jobs: JsonObject[],
  desiredStates: Set<string>,
): string | undefined {
  if (jobs.some(isBlockedJob) && desiredStates.has("blocked")) {
    return "blocked";
  }
  const state = String(buildState(build) ?? "unknown").toLowerCase();
  if (desiredStates.has(state)) {
    return state;
  }
  if (state === "finished") {
    const failed = jobs.some((job) => ["failed", "broken"].includes(String(readPath(job, ["state", "status"]) ?? "").toLowerCase()));
    const result = failed ? "failed" : "passed";
    return desiredStates.has(result) ? result : undefined;
  }
  return undefined;
}

async function fetchBuildForWait(parsed: ReturnType<typeof parseArgs>): Promise<JsonObject> {
  const bkArgs = ["build", "view", "--json"];
  if (parsed.positionals[0]) {
    bkArgs.push(parsed.positionals[0]);
  }
  appendValue(bkArgs, parsed, "--pipeline");
  appendValue(bkArgs, parsed, "--branch");
  appendValue(bkArgs, parsed, "--user");
  appendValue(bkArgs, parsed, "--job-states");
  appendBool(bkArgs, parsed, "--mine");
  return bkJson<JsonObject>(bkArgs);
}

function renderBuildMonitor(
  build: JsonObject,
  jobs: JsonObject[],
  result: string,
  attempts: number,
  startedAt: number,
  timedOut: boolean,
): string {
  const blockedJobs = jobs.filter(isBlockedJob);
  const summary = summarizeJobs(jobs);
  const blocks = [
    encode({
      build_monitor: {
        result,
        number: buildNumber(build),
        pipeline: pipelineName(build),
        state: buildState(build),
        blocked: blockedJobs.length > 0,
        attempts,
        elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
        jobs: summary,
        url: readPath(build, ["web_url", "url"]),
      },
    }),
  ];
  if (blockedJobs.length > 0) {
    blocks.push(renderList("blocked_jobs", blockedJobs, blockedJobSchema));
    blocks.push(renderHelp(["Run `bk-axi job unblock <job-id> --data '<json>'` to unblock a manual step"]));
  } else if (result === "failed" || result === "broken") {
    blocks.push(renderHelp(["Run `bk-axi build view <number> --pipeline <pipeline>` to find failed jobs", "Run `bk-axi job log <job-id>` for failure logs"]));
  } else if (timedOut) {
    blocks.push(renderHelp(["Run `bk-axi build wait <number> --pipeline <pipeline> --timeout <seconds>` to keep monitoring"]));
  }
  return renderOutput(blocks);
}

function detailText(value: unknown, limit: number): string {
  return truncateText(value, limit).text;
}

function extractUrl(output: string): string | null {
  return output.match(/https?:\/\/\S+/)?.[0] ?? null;
}

async function wrapLongOutput(
  label: string,
  output: string,
  maxChars: number,
): Promise<string> {
  const truncated = output.length > maxChars;
  const payload: Record<string, unknown> = {
    output: truncated ? output.slice(-maxChars) : output,
    truncated,
  };
  if (!truncated) {
    return encode({ [label]: payload });
  }
  payload["original_length"] = output.length;
  const dir = await mkdtemp(join(tmpdir(), "bk-axi-"));
  const file = join(dir, `${label}.log`);
  await writeFile(file, output, { encoding: "utf8", mode: 0o600, flag: "wx" });
  payload["full_log"] = file;
  return renderOutput([
    encode({ [label]: payload }),
    renderHelp([`Output shows last ${maxChars} of ${output.length} chars; full output saved to ${file}`]),
  ]);
}
