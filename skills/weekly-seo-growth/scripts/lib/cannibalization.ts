export type Severity = "BLOCK" | "RESERVED" | "WARN";

export interface KeywordOwner {
  primary: string;
  secondary: string[];
  status: string;
  url: string;
}

export interface Collision {
  severity: Severity;
  type: "PRIMARY_EXACT" | "PRIMARY_NEAR" | "COMPARISON" | "SECONDARY";
  overlap: number;
  ownerKeyword: string;
  matchedKeyword: string;
  status: string;
  url: string;
}

const STOP = new Set([
  "best", "the", "a", "an", "for", "of", "in", "to", "your", "you", "top", "and", "with", "on", "review", "reviews", "guide", "buying",
  "beste", "het", "de", "een", "voor", "van", "bij", "met", "en", "jouw", "je", "2024", "2025", "2026", "2027", "vs", "versus", "v"
]);

export function keywordTokens(keyword: string): string[] {
  return keyword.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((token) => token && !STOP.has(token)).map((token) => token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token);
}

function signature(keyword: string): Set<string> {
  return new Set(keywordTokens(keyword));
}

export function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size && !right.size) return 1;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function comparisonSides(keyword: string): [Set<string>, Set<string>] | null {
  const parts = keyword.toLowerCase().split(/\s+(?:vs\.?|versus|v\.?)\s+/);
  return parts.length === 2 ? [signature(parts[0]), signature(parts[1])] : null;
}

function comparisonMatches(left: [Set<string>, Set<string>], right: [Set<string>, Set<string>], threshold = 0.8): boolean {
  const direct = jaccard(left[0], right[0]) >= threshold && jaccard(left[1], right[1]) >= threshold;
  const reversed = jaccard(left[0], right[1]) >= threshold && jaccard(left[1], right[0]) >= threshold;
  return direct || reversed;
}

function ownerSeverity(status: string): "BLOCK" | "RESERVED" {
  return status.trim().toLowerCase() === "live" ? "BLOCK" : "RESERVED";
}

export function checkCannibalization(candidate: string, owners: KeywordOwner[]): Collision[] {
  const candidateSignature = signature(candidate);
  const candidateComparison = comparisonSides(candidate);
  const collisions: Collision[] = [];

  for (const owner of owners) {
    const primaryOverlap = jaccard(candidateSignature, signature(owner.primary));
    if (primaryOverlap === 1) {
      collisions.push({ severity: ownerSeverity(owner.status), type: "PRIMARY_EXACT", overlap: primaryOverlap, ownerKeyword: owner.primary, matchedKeyword: owner.primary, status: owner.status, url: owner.url });
    } else if (primaryOverlap >= 0.8) {
      collisions.push({ severity: "WARN", type: "PRIMARY_NEAR", overlap: primaryOverlap, ownerKeyword: owner.primary, matchedKeyword: owner.primary, status: owner.status, url: owner.url });
    }

    const ownerComparison = comparisonSides(owner.primary);
    if (candidateComparison && ownerComparison && comparisonMatches(candidateComparison, ownerComparison)) {
      collisions.push({ severity: ownerSeverity(owner.status), type: "COMPARISON", overlap: 1, ownerKeyword: owner.primary, matchedKeyword: owner.primary, status: owner.status, url: owner.url });
    }

    for (const secondary of owner.secondary) {
      const secondaryOverlap = jaccard(candidateSignature, signature(secondary));
      if (secondaryOverlap >= 0.85) {
        collisions.push({ severity: owner.status.trim().toLowerCase() === "live" ? "BLOCK" : "WARN", type: "SECONDARY", overlap: secondaryOverlap, ownerKeyword: owner.primary, matchedKeyword: secondary, status: owner.status, url: owner.url });
      }
    }
  }

  const deduplicated = new Map<string, Collision>();
  for (const collision of collisions) {
    const key = `${collision.type}|${collision.ownerKeyword}|${collision.matchedKeyword}`;
    if (!deduplicated.has(key)) deduplicated.set(key, collision);
  }
  const order: Record<Severity, number> = { BLOCK: 0, RESERVED: 1, WARN: 2 };
  return [...deduplicated.values()].sort((left, right) => order[left.severity] - order[right.severity] || right.overlap - left.overlap);
}
