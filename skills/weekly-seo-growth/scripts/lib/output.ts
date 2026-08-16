import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function resolveOutputRoot(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Output directory cannot be empty.");
  const absolute = resolve(trimmed);
  const filesystemRoot = resolve(absolute, sep);
  if (absolute === filesystemRoot) throw new Error("Refusing to use a filesystem root as --out.");
  return absolute;
}

export function safeArtifactPath(outputRoot: string, ...segments: string[]): string {
  if (!segments.length) throw new Error("Artifact path requires at least one segment.");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\")) {
      throw new Error(`Unsafe artifact path segment: ${JSON.stringify(segment)}.`);
    }
  }
  const target = resolve(outputRoot, ...segments);
  if (!isInside(resolve(outputRoot), target)) throw new Error("Refusing to write outside --out.");
  return target;
}

async function assertUsableDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to traverse output symlink: ${path}`);
  if (!stat.isDirectory()) throw new Error(`Expected an output directory: ${path}`);
}

async function ensureSafeDirectory(outputRoot: string, segments: string[]): Promise<string> {
  const absoluteRoot = resolveOutputRoot(outputRoot);
  await mkdir(absoluteRoot, { recursive: true });
  const canonicalRoot = await realpath(absoluteRoot);
  let current = canonicalRoot;
  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\")) throw new Error(`Unsafe directory segment: ${JSON.stringify(segment)}.`);
    current = resolve(current, segment);
    if (!isInside(canonicalRoot, current)) throw new Error("Refusing to create a directory outside --out.");
    if (await exists(current)) {
      await assertUsableDirectory(current);
    } else {
      try {
        await mkdir(current);
      } catch (error) {
        // Two concurrent writeArtifact calls can both see the directory as
        // missing and both try to create it. Losing that race is fine, but the
        // winner's directory still has to pass the same checks.
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await assertUsableDirectory(current);
      }
    }
  }
  return current;
}

export async function writeArtifact(options: {
  outputRoot: string;
  directories?: string[];
  filename: string;
  content: string;
  force?: boolean;
}): Promise<string> {
  const directories = options.directories ?? [];
  const directory = await ensureSafeDirectory(options.outputRoot, directories);
  const target = safeArtifactPath(directory, options.filename);
  await writeFile(target, options.content, { encoding: "utf8", flag: options.force ? "w" : "wx" });
  return target;
}

export function slugify(value: string, maxLength = 70): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "keyword";
}

export function dateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
