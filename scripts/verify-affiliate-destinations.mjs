#!/usr/bin/env node
/**
 * Bouwpoort: alleen geverifieerde ASIN's mogen live.
 *
 * Faalt de build zodra een affiliate-bestemming naar een Amazon-ZOEKPAGINA wijst
 * in plaats van naar een exact `/dp/<ASIN>`-pad. Draagbaar: werkt op een
 * vercel.json met redirects (thepillowadvisor, theduvetadvisor) en op losse
 * bron-/contentbestanden met kale Amazon-links.
 *
 * Achtergrond (24 aug 2026): 609 van 701 duvet-links en 188 van 203 pillow-links
 * wezen naar `amazon.com/s?k=`. Die converteerden ~45x slechter dan de directe
 * ASIN-links van therockhoundinghub. theyogasensei had deze poort al
 * (scripts/verify-affiliate-destinations.ts) en was daardoor als enige schoon.
 *
 * Gebruik in package.json:
 *   "verify:affiliate": "node scripts/verify-affiliate-destinations.mjs"
 *   "build": "npm run verify:affiliate && next build"
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join, extname } from 'node:path'

// Amazon accepteert zowel /dp/<ASIN> als /<product-slug>/dp/<ASIN>; beide zijn
// een echte productpagina. Alleen de zoekpagina is fout.
const ASIN_PATH = /^(\/[^/]+)?\/(dp|gp\/product)\/[A-Z0-9]{10}(\/[^/]*)?\/?$/
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mdx', '.md', '.json'])
// Research, briefs en documentatie worden nooit gepubliceerd; daar mogen ruwe
// Amazon-URL's staan zonder dat de build erop faalt.
const SKIP_DIR = new Set([
  'node_modules', '.next', '.git', 'dist', 'out', 'build',
  'content-briefs', 'research', 'docs', 'tests', '__tests__', 'marketing',
])

const failures = []
const root = process.cwd()

function isAmazon(hostname) {
  return /(^|\.)amazon\.[a-z.]{2,6}$/i.test(hostname)
}

/** Keurt één Amazon-URL. Retourneert een foutregel of null. */
function checkUrl(raw, where) {
  // Template-literals (`/dp/${asin}`) en placeholders zijn code, geen bestemming.
  // De echte waarde wordt op runtime samengesteld en elders gekeurd.
  if (/\$\{|:\w+\b|<[A-Za-z]+>|\.\.\./.test(raw)) return null

  let url
  try {
    url = new URL(raw)
  } catch {
    return null // geen absolute URL; niets te keuren
  }
  if (!isAmazon(url.hostname)) return null

  // Een affiliate-BESTEMMING draagt een tracking-tag, of is een zoekpagina die
  // er een zou krijgen. Een kale amazon.com-URL zonder tag is een bronvermelding
  // (evidenceUrl, een blogpost waarnaar we citeren) en hoort hier niet thuis.
  const isSearch = url.pathname === '/s' || url.searchParams.has('k')
  if (!url.searchParams.has('tag') && !isSearch) return null

  if (isSearch) {
    return `${where}: ZOEKPAGINA in plaats van ASIN — ${url.pathname}${url.search.slice(0, 60)}`
  }
  if (!ASIN_PATH.test(url.pathname)) {
    return `${where}: bestemming moet exact /dp/<ASIN> zijn, gevonden ${url.pathname}`
  }
  // Alleen de tag mag als query mee; verder niets bevriezen.
  for (const key of url.searchParams.keys()) {
    if (key !== 'tag') {
      return `${where}: onverwachte queryparameter '${key}' op een affiliate-bestemming`
    }
  }
  return null
}

// 1) vercel.json redirects
const vercelJson = resolve(root, 'vercel.json')
if (existsSync(vercelJson)) {
  const cfg = JSON.parse(readFileSync(vercelJson, 'utf8'))
  for (const rule of cfg.redirects ?? []) {
    const err = checkUrl(rule.destination ?? '', `vercel.json ${rule.source}`)
    if (err) failures.push(err)
  }
}

// 2) kale Amazon-links in bron en content
function walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      walk(full)
    } else if (SCAN_EXT.has(extname(name))) {
      const src = readFileSync(full, 'utf8')
      for (const m of src.matchAll(/https?:\/\/[^\s"'`)]*amazon\.[a-z.]{2,6}[^\s"'`)]*/gi)) {
        const err = checkUrl(m[0].replace(/[\\,;]+$/, ''), full.replace(root + '\\', '').replace(root + '/', ''))
        if (err) failures.push(err)
      }
    }
  }
}
walk(root)

if (failures.length) {
  const unique = [...new Set(failures)]
  console.error(`\nAffiliate-bestemmingen afgekeurd (${unique.length}):\n`)
  for (const f of unique.slice(0, 40)) console.error(`  - ${f}`)
  if (unique.length > 40) console.error(`  ... en nog ${unique.length - 40}`)
  console.error(
    '\nEen zoekpagina levert geen commissie en stuurt de lezer naar de concurrent.',
  )
  console.error(
    'Vervang door een geverifieerde /dp/<ASIN>, of haal de link weg als het product',
  )
  console.error('niet op Amazon bestaat. Verzin geen ASIN\'s.\n')
  process.exit(1)
}

console.log('Affiliate-bestemmingen: alle Amazon-links wijzen naar een exacte ASIN.')
