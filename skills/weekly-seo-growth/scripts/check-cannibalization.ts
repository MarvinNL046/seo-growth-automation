#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs, requireOne } from "./lib/args.ts";
import { checkCannibalization, type KeywordOwner } from "./lib/cannibalization.ts";
import { parseCsv, parseCsvLine } from "./lib/csv.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const registerPath = resolve(requireOne(args, "register"));
  const candidate = requireOne(args, "candidate").trim();
  const raw = await readFile(registerPath, "utf8");
  const rows = parseCsv(raw);
  const required = ["keyword", "secondary", "status", "url"];
  const headerLine = raw.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim()) ?? "";
  const header = new Set(parseCsvLine(headerLine).map((column) => column.trim()));
  const missing = required.filter((column) => !header.has(column));
  if (missing.length) throw new Error(`Keyword register is missing columns: ${missing.join(", ")}`);
  const owners: KeywordOwner[] = rows.filter((row) => row.keyword?.trim()).map((row) => ({
    primary: row.keyword.trim(),
    secondary: (row.secondary ?? "").split("|").map((value) => value.trim()).filter(Boolean),
    status: (row.status ?? "").trim(),
    url: (row.url ?? "").trim()
  }));
  const collisions = checkCannibalization(candidate, owners);
  const blocked = collisions.some((collision) => collision.severity === "BLOCK");
  process.stdout.write(`${JSON.stringify({ candidate, result: blocked ? "BLOCK" : collisions.length ? "REVIEW" : "CLEAR", collisions }, null, 2)}\n`);
  if (blocked) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
