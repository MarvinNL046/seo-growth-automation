#!/usr/bin/env bash
# Affiliate-link audit voor de Amazon-vloot.
#
# Controleert LIVE (nooit de repo — die loopt achter) per site:
#   1. gaan affiliate-links naar een directe /dp/<ASIN> of naar een zoekpagina /s?k=
#   2. draagt een /go/-redirect X-Robots-Tag: noindex en Cache-Control: no-store
#   3. blokkeert robots.txt /go/
#
# Achtergrond: 24 aug 2026 bleek 87% van de duvet-links en 93% van de pillow-links
# naar Amazon-zoekpagina's te wijzen. Die converteren ~45x slechter dan directe ASIN's.
# Zie vault: "Amazon Affiliate Links — Directe ASIN vs Zoekpagina".
#
# BELANGRIJK: dit script FAALT als het geen enkele affiliate-link vindt. "Niets gevonden"
# is geen bewijs van gezondheid — homepages dragen zelden links, geldpagina's wel.
#
# Gebruik:  bash scripts/affiliate-link-audit.sh [site ...]

set -uo pipefail

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
PAGES_PER_SITE="${PAGES_PER_SITE:-6}"

SITES_DEFAULT=(
  "therockhoundinghub.com" "theyogasensei.com" "thesawadvisor.com"
  "thepillowadvisor.com"   "theduvetadvisor.com" "go2-bali.com"
)
SITES=("$@"); [ ${#SITES[@]} -eq 0 ] && SITES=("${SITES_DEFAULT[@]}")

fail=0

# Haalt kandidaat-URL's uit de sitemap; volgt één niveau sitemap-index.
sitemap_urls() {
  local site="$1" sm body
  for sm in "https://$site/sitemap.xml" "https://$site/sitemap-index.xml"; do
    body=$(curl -sL -A "$UA" --max-time 25 "$sm" 2>/dev/null)
    [ -z "$body" ] && continue
    if printf '%s' "$body" | grep -qi "<sitemapindex"; then
      printf '%s' "$body" | grep -oE '<loc>[^<]+</loc>' | sed 's|</\?loc>||g' | head -3 \
      | while read -r child; do
          curl -sL -A "$UA" --max-time 25 "$child" | grep -oE '<loc>[^<]+</loc>' | sed 's|</\?loc>||g'
        done
    else
      printf '%s' "$body" | grep -oE '<loc>[^<]+</loc>' | sed 's|</\?loc>||g'
    fi
    return
  done
}

resolve() {
  local url="$1" loc="" hop=0
  while [ $hop -lt 3 ]; do
    loc=$(curl -s -o /dev/null -D - -A "$UA" --max-time 20 "$url" \
          | grep -i "^location:" | head -1 | tr -d '\r' | sed 's/[Ll]ocation: //')
    [ -z "$loc" ] && break
    case "$loc" in
      http*) url="$loc" ;;
      /*)    url="$(printf '%s' "$url" | sed -E 's|(https?://[^/]+).*|\1|')$loc" ;;
    esac
    case "$url" in *amazon.*) break ;; esac
    hop=$((hop + 1))
  done
  printf '%s' "$url"
}

for site in "${SITES[@]}"; do
  echo "═══ $site"

  if curl -sL --max-time 20 "https://$site/robots.txt" | grep -qi "Disallow:.*/go/"; then
    echo "  robots.txt /go/ geblokkeerd      ✓"
  else
    echo "  robots.txt /go/ NIET geblokkeerd ✗"; fail=1
  fi

  # Kandidaatpagina's: prioriteer commerciële paden waar links op staan.
  mapfile -t cands < <(sitemap_urls "$site" \
    | grep -iE "/(best|review|tools|guide|top|vs|beste)" | head -"$PAGES_PER_SITE")
  [ ${#cands[@]} -eq 0 ] && mapfile -t cands < <(sitemap_urls "$site" | head -"$PAGES_PER_SITE")
  [ ${#cands[@]} -eq 0 ] && cands=("https://$site")

  direct=0; search=0; checked=0

  for page in "${cands[@]}"; do
    html=$(curl -sL -A "$UA" --max-time 25 "$page" | tr -d '\0')

    # (a) kale amazon-links in de HTML
    d=$(printf '%s' "$html" | grep -aoE 'amazon\.[a-z.]+/(dp|gp/product)/[A-Z0-9]{10}' | wc -l)
    s=$(printf '%s' "$html" | grep -aoE 'amazon\.[a-z.]+/s\?' | wc -l)
    direct=$((direct + d)); search=$((search + s)); checked=$((checked + d + s))
    [ "$s" -gt 0 ] && { printf '  %-52s ZOEK ✗ (%s kale links)\n' "${page#https://$site}" "$s"; fail=1; }

    # (b) /go/-redirects
    mapfile -t slugs < <(printf '%s' "$html" | grep -aoE '/go/[A-Za-z0-9_/-]+' | sort -u | head -3)
    for sl in "${slugs[@]}"; do
      hdrs=$(curl -s -o /dev/null -D - -A "$UA" --max-time 20 "https://$site$sl")
      xr=$(printf '%s' "$hdrs" | grep -i "^x-robots-tag:"  | tr -d '\r' | sed 's/.*: //')
      cc=$(printf '%s' "$hdrs" | grep -i "^cache-control:" | tr -d '\r' | sed 's/.*: //')
      dest=$(resolve "https://$site$sl"); checked=$((checked + 1))

      case "$dest" in
        *"/dp/"*|*"/gp/product/"*) kind="DIRECT   ✓"; direct=$((direct + 1)) ;;
        *"/s?"*|*"/s/"*)           kind="ZOEK     ✗"; search=$((search + 1)); fail=1 ;;
        *)                         kind="ONBEKEND ✗"; fail=1 ;;
      esac

      h="✓"
      case "$xr" in *noindex*)  ;; *) h="✗ noindex ontbreekt";  fail=1 ;; esac
      case "$cc" in *no-store*) ;; *) h="✗ no-store ontbreekt"; fail=1 ;; esac

      printf '  %-46s %s  headers=%s\n' "$sl" "$kind" "$h"
    done
  done

  if [ "$checked" -eq 0 ]; then
    echo "  GEEN affiliate-links aangetroffen op ${#cands[@]} pagina's ✗"
    echo "  → dit is een FOUT, geen schone uitslag: of de sitemap klopt niet,"
    echo "    of de links renderen client-side, of de site verdient niets."
    fail=1
  else
    echo "  totaal: directe-ASIN=$direct  zoekpagina=$search  (over ${#cands[@]} pagina's)"
  fi
  echo
done

if [ $fail -ne 0 ]; then
  echo "AUDIT GEFAALD — zie ✗ hierboven."
  echo "Zoekpagina-links: vervang door een geverifieerde /dp/<ASIN>, of verwijder de link"
  echo "als het product niet op Amazon bestaat (veel DTC-merken niet). Verzin geen ASIN's."
  exit 1
fi
echo "AUDIT GESLAAGD."
