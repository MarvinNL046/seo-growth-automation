#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, requireOne } from "./lib/args.ts";
import { validateSiteProfile } from "./lib/profile.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const path = resolve(requireOne(args, "profile"));
  const requireReady = args.flags.has("require-ready");
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  const result = validateSiteProfile(parsed, requireReady);
  process.stdout.write(`${JSON.stringify({ profile: path, requireReady, valid: result.errors.length === 0, ...result }, null, 2)}\n`);
  if (result.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
