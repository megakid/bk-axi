import { installSessionStartHooks } from "axi-sdk-js";
import { AxiError } from "../errors.js";
import { renderHelp, renderOutput } from "../toon.js";

export const SETUP_HELP = `usage: bk-axi setup hooks
Install or repair agent SessionStart hooks for bk-axi ambient Buildkite context.

examples:
  bk-axi setup hooks`;

export async function setupCommand(args: string[]): Promise<string> {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return SETUP_HELP;
  }
  if (args.length !== 1 || args[0] !== "hooks") {
    throw new AxiError("Unknown setup action", "VALIDATION_ERROR", [
      "Run `bk-axi setup hooks`",
    ]);
  }
  installSessionStartHooks();
  return renderOutput([
    "hooks:\n  status: installed\n  integrations: Claude Code, Codex, OpenCode",
    renderHelp(["Restart your agent session to receive bk-axi ambient context"]),
  ]);
}
