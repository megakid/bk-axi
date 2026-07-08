import { AxiError } from "./errors.js";

export type FlagSpec = {
  name: string;
  short?: string;
  takesValue?: boolean;
  repeatable?: boolean;
  renamedTo?: string;
};

export type ParsedArgs = {
  positionals: string[];
  values: Map<string, string>;
  repeated: Map<string, string[]>;
  bools: Set<string>;
};

const UNIVERSAL_FLAGS = new Set(["--help", "-h"]);

export function parseArgs(
  commandName: string,
  args: string[],
  specs: FlagSpec[],
): ParsedArgs {
  const byName = new Map<string, FlagSpec>();
  const byShort = new Map<string, FlagSpec>();
  for (const spec of specs) {
    byName.set(spec.name, spec);
    if (spec.short) {
      byShort.set(spec.short, spec);
    }
  }

  const parsed: ParsedArgs = {
    positionals: [],
    values: new Map(),
    repeated: new Map(),
    bools: new Set(),
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (UNIVERSAL_FLAGS.has(arg)) {
      parsed.bools.add("--help");
      continue;
    }

    if (arg.startsWith("--")) {
      const equalsIndex = arg.indexOf("=");
      const name = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
      const inlineValue =
        equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1);
      const spec = byName.get(name);
      if (!spec) {
        throw unknownFlag(commandName, name, specs);
      }
      if (spec.renamedTo) {
        throw new AxiError(
          `${name} was renamed; use ${spec.renamedTo} instead`,
          "VALIDATION_ERROR",
          [`Run \`bk-axi ${commandName} --help\``],
        );
      }
      if (spec.takesValue) {
        const value =
          inlineValue ?? readFollowingValue(commandName, args, index, name);
        if (inlineValue === undefined) {
          index++;
        }
        storeValue(parsed, spec, value);
      } else {
        if (inlineValue !== undefined) {
          throw new AxiError(
            `${name} does not take a value`,
            "VALIDATION_ERROR",
            validFlagsHelp(commandName, specs),
          );
        }
        parsed.bools.add(spec.name);
      }
      continue;
    }

    if (arg.startsWith("-") && arg !== "-") {
      const spec = byShort.get(arg);
      if (!spec) {
        throw unknownFlag(commandName, arg, specs);
      }
      if (spec.takesValue) {
        const value = readFollowingValue(commandName, args, index, arg);
        index++;
        storeValue(parsed, spec, value);
      } else {
        parsed.bools.add(spec.name);
      }
      continue;
    }

    parsed.positionals.push(arg);
  }

  return parsed;
}

export function has(parsed: ParsedArgs, name: string): boolean {
  return parsed.bools.has(name);
}

export function get(parsed: ParsedArgs, name: string): string | undefined {
  return parsed.values.get(name);
}

export function getAll(parsed: ParsedArgs, name: string): string[] {
  return parsed.repeated.get(name) ?? [];
}

export function requirePositional(
  parsed: ParsedArgs,
  index: number,
  label: string,
  command: string,
): string {
  const value = parsed.positionals[index];
  if (!value) {
    throw new AxiError(`Missing ${label}`, "VALIDATION_ERROR", [
      `Run \`bk-axi ${command} --help\``,
    ]);
  }
  return value;
}

export function rejectExtraPositionals(
  parsed: ParsedArgs,
  max: number,
  command: string,
): void {
  if (parsed.positionals.length > max) {
    const unexpected = parsed.positionals[max] ?? "";
    throw new AxiError(
      `Unexpected argument: ${unexpected}`,
      "VALIDATION_ERROR",
      [`Run \`bk-axi ${command} --help\``],
    );
  }
}

export function positiveInt(value: string, label: string): number {
  if (!/^\d+$/.test(value)) {
    throw new AxiError(`${label} must be a positive integer`, "VALIDATION_ERROR");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new AxiError(`${label} must be a positive integer`, "VALIDATION_ERROR");
  }
  return parsed;
}

export function nonNegativeInt(value: string, label: string): number {
  if (!/^\d+$/.test(value)) {
    throw new AxiError(`${label} must be a non-negative integer`, "VALIDATION_ERROR");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new AxiError(`${label} must be a non-negative integer`, "VALIDATION_ERROR");
  }
  return parsed;
}

export function validFlagsHelp(commandName: string, specs: FlagSpec[]): string[] {
  const names = specs
    .filter((spec) => !spec.renamedTo)
    .map((spec) => spec.short ? `${spec.short}/${spec.name}` : spec.name)
    .sort();
  return [`valid flags for \`${commandName}\`: ${names.join(", ")} (--help always allowed)`];
}

function readFollowingValue(
  commandName: string,
  args: string[],
  index: number,
  flag: string,
): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new AxiError(
      `Missing value for ${flag}`,
      "VALIDATION_ERROR",
      [`Run \`bk-axi ${commandName} --help\``],
    );
  }
  return value;
}

function storeValue(parsed: ParsedArgs, spec: FlagSpec, value: string): void {
  if (spec.repeatable) {
    const values = parsed.repeated.get(spec.name) ?? [];
    values.push(value);
    parsed.repeated.set(spec.name, values);
    return;
  }
  parsed.values.set(spec.name, value);
}

function unknownFlag(
  commandName: string,
  flag: string,
  specs: FlagSpec[],
): AxiError {
  return new AxiError(
    `unknown flag ${flag} for \`${commandName}\``,
    "VALIDATION_ERROR",
    validFlagsHelp(commandName, specs),
  );
}
