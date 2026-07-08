import { encode } from "@toon-format/toon";
import { parseArgs, rejectExtraPositionals } from "../args.js";
import { bkJson } from "../bk.js";
import { AxiError } from "../errors.js";
import { redactSecrets } from "../json.js";
import { renderHelp, renderOutput } from "../toon.js";

export const AUTH_HELP = `usage: bk-axi auth <subcommand>
subcommands[1]:
  status
examples:
  bk-axi auth status`;

export async function authCommand(args: string[]): Promise<string> {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    return AUTH_HELP;
  }
  if (subcommand !== "status") {
    throw new AxiError(`Unknown auth subcommand: ${subcommand}`, "VALIDATION_ERROR", [
      "Run `bk-axi auth --help`",
    ]);
  }
  const parsed = parseArgs("auth status", rest, []);
  rejectExtraPositionals(parsed, 0, "auth status");
  const status = redactSecrets(await bkJson(["auth", "status", "--json"]));
  return renderOutput([
    encode({ auth: status }),
    renderHelp(["Run `bk-axi build list --limit 10` to verify build access"]),
  ]);
}
