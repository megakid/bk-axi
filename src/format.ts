import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function oneLine(value: unknown, maxChars = 80): string {
  const text = value === undefined || value === null ? "" : String(value);
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, maxChars)}...`;
}

export function shortSha(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return text.length > 12 ? text.slice(0, 12) : text;
}

export function relativeTime(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "unknown";
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "unknown";
  }
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }
  return `${Math.floor(months / 12)}y ago`;
}

export function collapseHome(path: string): string {
  const home = process.env["HOME"];
  if (home && path === home) {
    return "~";
  }
  if (home && path.startsWith(`${home}/`)) {
    return `~/${path.slice(home.length + 1)}`;
  }
  return path;
}

export function currentExecutable(): string {
  return collapseHome(process.argv[1] ?? fileURLToPath(import.meta.url));
}

export function sourceDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}
