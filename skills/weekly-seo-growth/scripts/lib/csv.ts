export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += character;
  }
  if (quoted) throw new Error("Malformed CSV: unclosed quoted field.");
  cells.push(value);
  return cells;
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]).map((cell) => cell.trim());
  if (new Set(header).size !== header.length) throw new Error("Malformed CSV: duplicate header names.");
  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    if (cells.length !== header.length) throw new Error(`Malformed CSV row ${rowIndex + 2}: expected ${header.length} cells, received ${cells.length}.`);
    return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
  });
}
