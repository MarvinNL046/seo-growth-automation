#!/usr/bin/env node
/**
 * Bouwpoort: geen prijzen in content die naast een Amazon-link staat.
 *
 * Het Associates Operating Agreement staat het tonen van prijzen alleen toe via de
 * Product Advertising API. Elk product heeft een `priceTier` ($/$$/$$$) en dat is
 * wat je in plaats daarvan toont — dezelfde regel die theyogasensei al hanteert.
 *
 * Wat deze poort WEL afkeurt: een bedrag in een contentbestand van een site die
 * met Amazon-links werkt, bijvoorbeeld "About $328" of "vaak rond $20-$25".
 *
 * Wat hij MET RUST laat:
 *  - `$`, `$$`, `$$$` — dat zijn tiers, geen bedragen.
 *  - Euro-bedragen op de Nederlandse pagina's. Die staan bij producten zonder
 *    `amazonQuery`, dus zonder affiliate-link; een gedateerde fabrikantsprijs is
 *    daar gewone redactie en geen Amazon-prijs. Wordt aan zo'n product later wél
 *    een Amazon-link gehangen, dan valt hij alsnog onder de eerste regel.
 *  - Bestanden die nooit publiceren (research, briefs, docs).
 *
 * Gebruik in package.json:
 *   "verify:prices": "node scripts/verify-no-static-prices.mjs"
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

// Bedrag = valutateken plus een cijfer. `$$` alleen is een tier en valt hier buiten.
const BEDRAG = /(?<![$\w])\$\s?\d[\d.,]*/g
const SCAN_EXT = new Set(['.ts', '.tsx', '.mdx', '.md'])
const SKIP_DIR = new Set([
  'node_modules', '.next', '.git', 'dist', 'out', 'build',
  'content-briefs', 'research', 'docs', 'tests', '__tests__', 'marketing', 'scripts',
])

const root = process.cwd()
const failures = []

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
    if (statSync(full).isDirectory()) {
      walk(full)
      continue
    }
    if (!SCAN_EXT.has(extname(name))) continue
    const src = readFileSync(full, 'utf8')
    const regels = src.split('\n')
    for (let i = 0; i < regels.length; i++) {
      // Een `associates-ok:`-comment op de regel is een bewuste uitzondering.
      if (regels[i].includes('associates-ok:')) continue
      for (const m of regels[i].matchAll(BEDRAG)) {
        failures.push(`${relative(root, full)}:${i + 1}  ${regels[i].trim().slice(0, 96)}`)
        break
      }
    }
  }
}

walk(join(root, 'content'))
walk(join(root, 'app'))
walk(join(root, 'components'))

if (failures.length) {
  const uniek = [...new Set(failures)]
  console.error(`\nStatische prijzen gevonden (${uniek.length}):\n`)
  for (const f of uniek.slice(0, 30)) console.error(`  - ${f}`)
  if (uniek.length > 30) console.error(`  ... en nog ${uniek.length - 30}`)
  console.error(
    '\nAssociates staat prijzen alleen toe via de Product Advertising API, en die',
  )
  console.error('is hier nog niet beschikbaar. Gebruik het priceTier-veld ($/$$/$$$),')
  console.error('of schrijf de zin om zonder bedrag. Een bewuste uitzondering markeer')
  console.error('je met een `associates-ok:`-comment op dezelfde regel.\n')
  process.exit(1)
}

console.log('Statische prijzen: geen bedragen in content die met Amazon-links werkt.')
