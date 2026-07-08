import { AxiError } from "./errors.js";
import type { FieldDef } from "./toon.js";

export type ExtraFieldSpec = {
  def: FieldDef;
};

export function parseFields(
  raw: string | undefined,
  available: Record<string, ExtraFieldSpec>,
): FieldDef[] {
  if (raw === undefined) {
    return [];
  }

  const requested = [
    ...new Set(raw.split(",").map((field) => field.trim()).filter(Boolean)),
  ];
  const unknown = requested.filter((field) => !(field in available));
  if (unknown.length > 0) {
    throw new AxiError(
      `Unknown field(s): ${unknown.join(", ")}. Available: ${Object.keys(available).sort().join(", ")}`,
      "VALIDATION_ERROR",
    );
  }

  return requested.map((field) => available[field]!.def);
}
