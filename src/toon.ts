import { encode } from "@toon-format/toon";

export type JsonObject = Record<string, unknown>;

export type FieldDef = {
  key: string;
  as?: string | undefined;
  value: (item: JsonObject) => unknown;
};

export function field(key: string, as?: string): FieldDef {
  return {
    key,
    as,
    value: (item) => item[key] ?? null,
  };
}

export function custom(
  as: string,
  value: (item: JsonObject) => unknown,
): FieldDef {
  return { key: as, as, value };
}

export function lower(key: string, as?: string): FieldDef {
  return {
    key,
    as,
    value: (item) =>
      typeof item[key] === "string"
        ? (item[key] as string).toLowerCase()
        : (item[key] ?? null),
  };
}

export function extract(item: JsonObject, schema: FieldDef[]): JsonObject {
  const row: JsonObject = {};
  for (const def of schema) {
    row[def.as ?? def.key] = def.value(item);
  }
  return row;
}

export function renderList(
  label: string,
  items: JsonObject[],
  schema: FieldDef[],
): string {
  return encode({ [label]: items.map((item) => extract(item, schema)) });
}

export function renderDetail(
  label: string,
  item: JsonObject,
  schema: FieldDef[],
): string {
  return encode({ [label]: extract(item, schema) });
}

export function renderHelp(lines: string[]): string {
  if (lines.length === 0) {
    return "";
  }
  return `help[${lines.length}]:\n${lines.map((line) => `  ${line}`).join("\n")}`;
}

export function renderOutput(blocks: string[]): string {
  return blocks.filter((block) => block.length > 0).join("\n");
}

export function renderError(
  message: string,
  code: string,
  suggestions: string[] = [],
): string {
  return renderOutput([encode({ error: message, code }), renderHelp(suggestions)]);
}

export function countLine(count: number, limit?: number): string {
  if (limit === undefined) {
    return `count: ${count}`;
  }
  return `count: ${count} shown`;
}

export function truncateText(
  value: unknown,
  maxChars: number,
): { text: string; truncated: boolean; originalLength: number } {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.length <= maxChars) {
    return { text, truncated: false, originalLength: text.length };
  }
  return {
    text: `${text.slice(0, maxChars)}...`,
    truncated: true,
    originalLength: text.length,
  };
}
