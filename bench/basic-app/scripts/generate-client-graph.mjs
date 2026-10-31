// Generates a bulk client-side module graph (app/ui/vendor/, gitignored)
// plus synthetic route segments (app/g/, gitignored) that each use a
// different overlapping slice of it.
//
// Flight's client-reference import rows carry each module's transitive
// chunk closure. Turbopack's production chunker partitions modules by
// which route chunk-groups use them, so a small app with a handful of
// uniform routes merges everything into a few chunks regardless of code
// volume. Real deployments have hundreds of segments with heterogeneous
// imports, which is what produces closures of dozens of chunks repeated
// across every import row. The generated segments reproduce that shape at
// a moderate scale.
//
// The render-pipeline benchmark runs this automatically before building.
// To build bench/basic-app manually, run it once first:
//   node bench/basic-app/scripts/generate-client-graph.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = 'v5-120x24-40routes-w60-c120'
const MODULES = 120
const FUNCTIONS_PER_MODULE = 24
const ROWS_PER_TABLE = 18
const ROUTES = 40
const ROUTE_WINDOW = 60
const CORE_WINDOW = 120

const appDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'app'
)
const vendorDir = path.join(appDir, 'ui', 'vendor')
const routesDir = path.join(appDir, 'g')
const marker = path.join(vendorDir, '.generated')

if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === VERSION) {
  process.exit(0)
}

fs.rmSync(vendorDir, { recursive: true, force: true })
fs.rmSync(routesDir, { recursive: true, force: true })
fs.mkdirSync(vendorDir, { recursive: true })
fs.mkdirSync(routesDir, { recursive: true })

for (let m = 0; m < MODULES; m++) {
  const parts = [
    "'use client';",
    '// Generated module: part of the bulk client graph. See scripts/generate-client-graph.mjs.',
  ]
  for (let f = 0; f < FUNCTIONS_PER_MODULE; f++) {
    const rows = []
    for (let r = 0; r < ROWS_PER_TABLE; r++) {
      rows.push(
        `{a:${r * 7 + 3},b:${r * 13 + m},m:999983,tag:'g${m}_${f}_${r}_${'x'.repeat(48)}'}`
      )
    }
    parts.push(
      `export function graph${m}_${f}(input) {
  const table = [${rows.join(',')}]
  let acc = typeof input === 'number' ? input : String(input).length
  for (const t of table) acc = (acc * t.a + t.b) % t.m
  return {acc, tags: table.length}
}`
    )
  }
  fs.writeFileSync(path.join(vendorDir, `graph${m}.js`), parts.join('\n'))
}

// Entry used by the committed fixtures: the "core" shared slice.
const index = [
  "'use client';",
  ...Array.from(
    { length: CORE_WINDOW },
    (_, i) => `import {graph${i}_0} from './graph${i}'`
  ),
  `const PROBES = [${Array.from({ length: CORE_WINDOW }, (_, i) => `graph${i}_0`).join(', ')}]`,
  `export function graphProbe(seed) {
  return PROBES[Math.abs(seed | 0) % PROBES.length](seed).acc
}`,
]
fs.writeFileSync(path.join(vendorDir, 'index.js'), index.join('\n'))

// Per-fixture foundation slices: the docs and blog routes' client
// components sit on differently-sized subsets of the shared graph, the
// way different surfaces of a deployment share different vendor layers.
for (const [name, size] of [
  ['docs', 20],
  ['blog', 35],
]) {
  fs.writeFileSync(
    path.join(vendorDir, `slice-${name}.js`),
    [
      "'use client';",
      ...Array.from(
        { length: size },
        (_, i) => `import {graph${i}_0} from './graph${i}'`
      ),
      `const PROBES = [${Array.from({ length: size }, (_, i) => `graph${i}_0`).join(', ')}]`,
      `export function ${name}SliceProbe(seed) {
  return PROBES[Math.abs(seed | 0) % PROBES.length](seed).acc
}`,
    ].join('\n')
  )
}

// Synthetic segments: each uses a different overlapping window of the
// graph, giving modules distinct route-usage signatures.
for (let r = 0; r < ROUTES; r++) {
  const dir = path.join(routesDir, `r${r}`)
  fs.mkdirSync(dir, { recursive: true })
  const start = Math.floor(
    (r * (MODULES - ROUTE_WINDOW)) / Math.max(1, ROUTES - 1)
  )
  const mods = Array.from({ length: ROUTE_WINDOW }, (_, i) => start + i)
  fs.writeFileSync(
    path.join(dir, 'widget.js'),
    [
      "'use client';",
      ...mods.map(
        (m) => `import {graph${m}_0} from '../../ui/vendor/graph${m}'`
      ),
      `const PROBES = [${mods.map((m) => `graph${m}_0`).join(', ')}]`,
      `export default function Widget() {
  return <div data-route="r${r}">{PROBES.length}</div>
}`,
    ].join('\n')
  )
  fs.writeFileSync(
    path.join(dir, 'page.js'),
    [
      `import Widget from './widget'`,
      '',
      `export const dynamic = 'force-dynamic'`,
      '',
      `export default function Page() {
  return <Widget />
}`,
    ].join('\n')
  )
}

fs.writeFileSync(marker, VERSION)
console.log(
  `generated ${MODULES} graph modules and ${ROUTES} segments in bench/basic-app`
)
