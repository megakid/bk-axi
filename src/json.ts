import type { JsonObject } from "./toon.js";
export type { JsonObject } from "./toon.js";

export function asArray(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter(isObject);
  }
  if (isObject(value)) {
    for (const key of ["builds", "pipelines", "jobs", "data"]) {
      const nested = value[key];
      if (Array.isArray(nested)) {
        return nested.filter(isObject);
      }
    }
  }
  return [];
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readPath(item: JsonObject, paths: string[]): unknown {
  for (const path of paths) {
    let cursor: unknown = item;
    let found = true;
    for (const part of path.split(".")) {
      if (!isObject(cursor) || !(part in cursor)) {
        found = false;
        break;
      }
      cursor = cursor[part];
    }
    if (found && cursor !== undefined && cursor !== null && cursor !== "") {
      return cursor;
    }
  }
  return null;
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (!isObject(value)) {
    return value;
  }
  const redacted: JsonObject = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/token|secret|password|credential/i.test(key)) {
      redacted[key] = "<redacted>";
    } else {
      redacted[key] = redactSecrets(nested);
    }
  }
  return redacted;
}
