import { AUTH_HELP, authCommand } from "./commands/auth.js";
import { BUILD_HELP, buildCommand } from "./commands/build.js";
import { homeCommand } from "./commands/home.js";
import { JOB_HELP, jobCommand } from "./commands/job.js";
import { PIPELINE_HELP, pipelineCommand } from "./commands/pipeline.js";
import { SETUP_HELP, setupCommand } from "./commands/setup.js";
import { exitCodeForError, toAxiError, AxiError } from "./errors.js";
import { renderError } from "./toon.js";

export const TOP_HELP = `usage: bk-axi [command] [args] [flags]
commands[6]:
  (none)=dashboard, build, job, pipeline, auth, setup
flags[3]:
  --help, -v/-V/--version
examples:
  bk-axi
  bk-axi build list --pipeline api --state failed
  bk-axi build view 42 --pipeline api
  bk-axi job log <job-id>
  bk-axi pipeline list
  bk-axi setup hooks`;

const VERSION = "0.1.0";

const COMMAND_HELP: Record<string, string> = {
  build: BUILD_HELP,
  job: JOB_HELP,
  pipeline: PIPELINE_HELP,
  auth: AUTH_HELP,
  setup: SETUP_HELP,
};

type Stdout = Pick<NodeJS.WriteStream, "write">;

export async function runCli(argv: string[]): Promise<{ stdout: string; exitCode: number }> {
  try {
    return { stdout: await dispatch(argv), exitCode: 0 };
  } catch (error) {
    const axiError = toAxiError(error);
    return {
      stdout: renderError(axiError.message, axiError.code, axiError.suggestions),
      exitCode: exitCodeForError(axiError),
    };
  }
}

export async function main(options: { argv?: string[]; stdout?: Stdout } = {}): Promise<void> {
  const result = await runCli(options.argv ?? process.argv.slice(2));
  const stdout = options.stdout ?? process.stdout;
  stdout.write(result.stdout);
  stdout.write("\n");
  process.exitCode = result.exitCode;
}

async function dispatch(argv: string[]): Promise<string> {
  const [command, ...rest] = argv;
  if (!command) {
    return homeCommand([]);
  }
  if (command === "--help" || command === "-h") {
    return TOP_HELP;
  }
  if (command === "--version" || command === "-v" || command === "-V") {
    return VERSION;
  }
  if (command.startsWith("-")) {
    throw new AxiError(`unknown flag ${command} for \`bk-axi\``, "VALIDATION_ERROR", [
      "valid flags for `bk-axi`: --help, --version",
    ]);
  }
  if (rest.includes("--help") || rest.includes("-h")) {
    const help = COMMAND_HELP[command];
    if (help) {
      return help;
    }
  }
  switch (command) {
    case "build":
      return buildCommand(rest);
    case "job":
      return jobCommand(rest);
    case "pipeline":
      return pipelineCommand(rest);
    case "auth":
      return authCommand(rest);
    case "setup":
      return setupCommand(rest);
    default:
      throw new AxiError(`Unknown command: ${command}`, "VALIDATION_ERROR", [
        "Run `bk-axi --help`",
      ]);
  }
}
