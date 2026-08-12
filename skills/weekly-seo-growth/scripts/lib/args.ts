export interface ParsedArgs {
  values: Map<string, string[]>;
  flags: Set<string>;
  positionals: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const equals = token.indexOf("=");
    if (equals > 2) {
      const key = token.slice(2, equals);
      const value = token.slice(equals + 1);
      values.set(key, [...(values.get(key) ?? []), value]);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      values.set(key, [...(values.get(key) ?? []), next]);
      index += 1;
    } else {
      flags.add(key);
    }
  }

  return { values, flags, positionals };
}

export function one(args: ParsedArgs, key: string): string | undefined {
  const values = args.values.get(key) ?? [];
  if (values.length > 1) throw new Error(`--${key} may be supplied only once.`);
  return values[0];
}

export function many(args: ParsedArgs, key: string): string[] {
  return args.values.get(key) ?? [];
}

export function requireOne(args: ParsedArgs, key: string): string {
  const value = one(args, key)?.trim();
  if (!value) throw new Error(`Missing required --${key} value.`);
  return value;
}

export function requireApiMode(args: ParsedArgs): "dry-run" | "paid" {
  const dryRun = args.flags.has("dry-run");
  const paid = args.flags.has("confirm-paid-api");
  if (dryRun === paid) {
    throw new Error("Choose exactly one: --dry-run or --confirm-paid-api.");
  }
  return dryRun ? "dry-run" : "paid";
}
