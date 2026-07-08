import { execFile } from "node:child_process";
import { AxiError, firstUsefulLine } from "./errors.js";

export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const MAX_BUFFER_BYTES = 20 * 1024 * 1024;
const BASE_FLAGS = ["--no-input", "--no-pager"];

export function withBaseFlags(args: string[], yes = false): string[] {
  return yes ? [...args, "--yes", ...BASE_FLAGS] : [...args, ...BASE_FLAGS];
}

export function bkRaw(args: string[], options: { yes?: boolean } = {}): Promise<ExecResult> {
  return run(withBaseFlags(args, options.yes ?? false));
}

export async function bkJson<T = unknown>(
  args: string[],
  options: { yes?: boolean } = {},
): Promise<T> {
  const result = await bkRaw(args, options);
  if (result.exitCode !== 0) {
    throw mapBkError(result);
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new AxiError(
      `Unexpected bk JSON output: ${result.stdout.slice(0, 200)}`,
      "UNKNOWN",
    );
  }
}

export async function bkText(
  args: string[],
  options: { yes?: boolean } = {},
): Promise<string> {
  const result = await bkRaw(args, options);
  if (result.exitCode !== 0) {
    throw mapBkError(result);
  }
  return result.stdout.trim();
}

function run(args: string[]): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      "bk",
      args,
      { maxBuffer: MAX_BUFFER_BYTES },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          resolve({ stdout: "", stderr: "ENOENT", exitCode: 127 });
          return;
        }
        const rawCode = error
          ? ((error as Error & { code?: number | string }).code ?? 1)
          : 0;
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode: typeof rawCode === "number" ? rawCode : 1,
        });
      },
    );
  });
}

function mapBkError(result: ExecResult): AxiError {
  if (result.stderr === "ENOENT") {
    return new AxiError("bk CLI is not installed", "BK_NOT_INSTALLED", [
      "Install with `brew tap buildkite/buildkite && brew install buildkite/buildkite/bk`",
    ]);
  }

  const combined = `${result.stderr}\n${result.stdout}`;
  const line = firstUsefulLine(combined) || `bk exited with code ${result.exitCode}`;
  if (/auth|token|unauthorized|401/i.test(combined)) {
    return new AxiError("Buildkite authentication required", "AUTH_REQUIRED", [
      "Run `bk configure --org <org> --token \"$BUILDKITE_API_TOKEN\" --no-input` or `bk auth login`",
    ]);
  }
  if (/forbidden|permission|403/i.test(combined)) {
    return new AxiError("Buildkite permissions are insufficient", "FORBIDDEN");
  }
  if (/not found|404/i.test(combined)) {
    return new AxiError(line, "NOT_FOUND");
  }
  return new AxiError(line, "UNKNOWN");
}
