#!/usr/bin/env node
// Generates a deterministic synthetic Next.js App Router application used to
// benchmark the synchronous turbo-tasks engine against the async one.
//
// The shape is chosen to exercise the parts of the engine the two modes differ
// on, so a scheduling regression shows up as wall-clock:
//
//   * a wide shared component library     -> wide `parallel!` fan-out per module
//   * deep import chains                  -> genuinely serial dependency chains
//   * many independent pages              -> top-level (cross-endpoint) parallelism
//   * client/server component boundaries  -> two module graphs per page
//   * CSS modules                         -> a second asset pipeline
//
// Everything is derived from a seeded PRNG, so the same preset always produces
// byte-identical sources and the two engines build the exact same graph.
//
// Usage: node bench/sync-engine/generate.js [preset] [--out <dir>]

const fs = require('fs')
const path = require('path')

const PRESETS = {
  // Fast iteration while working on the scheduler.
  small: {
    pages: 6,
    sharedModules: 120,
    perPageModules: 12,
    fanout: 4,
    chainDepth: 8,
    clientRatio: 0.35,
  },
  // The default. Big enough that scheduling dominates and the async/sync gap is
  // unambiguous, small enough for a handful of runs per iteration.
  medium: {
    pages: 20,
    sharedModules: 500,
    perPageModules: 25,
    fanout: 5,
    chainDepth: 14,
    clientRatio: 0.35,
  },
  // Closer to a real product app (v0/chat scale).
  large: {
    pages: 60,
    sharedModules: 1500,
    perPageModules: 40,
    fanout: 6,
    chainDepth: 20,
    clientRatio: 0.35,
  },
}

// xorshift32 — tiny, deterministic, no dependencies.
function makeRng(seed) {
  let s = seed >>> 0 || 0x9e3779b9
  return function next() {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 0x1_0000_0000
  }
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}

const WORDS = [
  'alpha',
  'beacon',
  'cobalt',
  'delta',
  'ember',
  'fjord',
  'gamma',
  'harbor',
  'indigo',
  'jasper',
  'kelvin',
  'lumen',
  'meridian',
  'nimbus',
  'onyx',
  'pivot',
  'quartz',
  'ripple',
  'summit',
  'tundra',
  'umber',
  'vertex',
  'willow',
  'xenon',
  'yonder',
  'zephyr',
]

function nameFor(rng, i) {
  return `${pick(rng, WORDS)}${pick(rng, WORDS).replace(/^./, (c) => c.toUpperCase())}${i}`
}

// A leaf module: pure functions + constants. No imports, so it terminates the
// dependency chain and gives the engine a lot of independent parse/transform work.
function leafModule(rng, id, name) {
  const rows = 6 + Math.floor(rng() * 10)
  const table = Array.from({ length: rows }, (_, r) => {
    return `  { id: ${r}, key: '${pick(rng, WORDS)}-${r}', weight: ${(rng() * 100).toFixed(3)} },`
  }).join('\n')
  return `// leaf ${id}
export const ${name}Table = [
${table}
]

export function ${name}Total(scale) {
  let total = 0
  for (const row of ${name}Table) {
    total += row.weight * (scale ?? 1)
  }
  return total
}

export function ${name}Format(value) {
  return \`\${'${name}'}: \${Number(value).toFixed(2)}\`
}

export default ${name}Table
`
}

// An interior module: imports `fanout` dependencies and re-exports a component.
function interiorModule(rng, id, name, deps, isClient) {
  const imports = deps
    .map(
      (d, i) =>
        `import { ${d.name}Total as dep${i}Total } from '${d.specifier}'`
    )
    .join('\n')
  const sums = deps.map((_, i) => `dep${i}Total(scale)`).join(' + ')
  const directive = isClient ? "'use client'\n\n" : ''
  const hook = isClient
    ? `
export function use${name}(scale) {
  const [value, setValue] = React.useState(() => ${name}Total(scale))
  React.useEffect(() => {
    setValue(${name}Total(scale))
  }, [scale])
  return value
}
`
    : ''
  return `${directive}import * as React from 'react'
${imports}

export function ${name}Total(scale) {
  return ${sums || '0'}
}

export function ${name}({ scale = 1, children }) {
  const total = ${name}Total(scale)
  return React.createElement(
    'section',
    { className: '${name.toLowerCase()}', 'data-total': total },
    React.createElement('h3', null, '${name}'),
    children
  )
}
${hook}
export default ${name}
`
}

function cssModule(rng, name) {
  const rules = Array.from({ length: 8 + Math.floor(rng() * 8) }, (_, i) => {
    return `.${name.toLowerCase()}_${i} {
  display: flex;
  padding: ${(rng() * 16).toFixed(1)}px;
  color: rgb(${Math.floor(rng() * 255)}, ${Math.floor(rng() * 255)}, ${Math.floor(rng() * 255)});
  border-radius: ${(rng() * 8).toFixed(1)}px;
}`
  }).join('\n\n')
  return `${rules}\n`
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, contents)
}

function generate(preset, outDir) {
  const cfg = PRESETS[preset]
  if (!cfg) {
    throw new Error(
      `unknown preset '${preset}' (have: ${Object.keys(PRESETS).join(', ')})`
    )
  }
  const rng = makeRng(0xc0ffee)

  fs.rmSync(outDir, { recursive: true, force: true })

  // ---- shared library -------------------------------------------------------
  // Modules 0..chainDepth are a serial chain (each imports only the previous),
  // the rest fan out over already-emitted modules. That mixes a genuinely serial
  // critical path with a lot of exposed parallelism.
  const shared = []
  for (let i = 0; i < cfg.sharedModules; i++) {
    const name = nameFor(rng, i)
    const rel = `lib/mod${i}.js`
    shared.push({ id: i, name, rel, specifier: `../lib/mod${i}.js` })
  }

  for (let i = 0; i < shared.length; i++) {
    const mod = shared[i]
    const file = path.join(outDir, mod.rel)
    if (i === 0) {
      write(file, leafModule(rng, i, mod.name))
      continue
    }
    if (i <= cfg.chainDepth) {
      // serial chain segment
      const dep = shared[i - 1]
      write(
        file,
        interiorModule(
          rng,
          i,
          mod.name,
          [{ name: dep.name, specifier: `./mod${i - 1}.js` }],
          false
        )
      )
      continue
    }
    // Every 5th module is a leaf so the graph has real breadth.
    if (i % 5 === 0) {
      write(file, leafModule(rng, i, mod.name))
      continue
    }
    const deps = []
    for (let d = 0; d < cfg.fanout; d++) {
      const j = Math.floor(rng() * i)
      deps.push({ name: shared[j].name, specifier: `./mod${j}.js` })
    }
    const isClient = rng() < cfg.clientRatio
    write(file, interiorModule(rng, i, mod.name, deps, isClient))
  }

  // ---- per-page modules + routes -------------------------------------------
  for (let p = 0; p < cfg.pages; p++) {
    const pageDir = path.join(outDir, 'app', `route${p}`)
    const locals = []
    for (let m = 0; m < cfg.perPageModules; m++) {
      const name = nameFor(rng, 100000 + p * 1000 + m)
      const deps = []
      for (let d = 0; d < cfg.fanout; d++) {
        const j = Math.floor(rng() * shared.length)
        deps.push({ name: shared[j].name, specifier: `../../lib/mod${j}.js` })
      }
      for (const local of locals.slice(-2)) {
        deps.push({ name: local.name, specifier: `./${local.file}` })
      }
      const isClient = rng() < cfg.clientRatio
      const file = `part${m}.js`
      write(
        path.join(pageDir, file),
        interiorModule(rng, m, name, deps, isClient)
      )
      locals.push({ name, file })
    }

    write(path.join(pageDir, 'styles.module.css'), cssModule(rng, `route${p}`))

    const imports = locals
      .map((l, i) => `import Part${i} from './${l.file}'`)
      .join('\n')
    const body = locals
      .map(
        (_, i) => `      React.createElement(Part${i}, { scale: ${i + 1} }),`
      )
      .join('\n')
    write(
      path.join(pageDir, 'page.js'),
      `import * as React from 'react'
import styles from './styles.module.css'
${imports}

export default function Route${p}Page() {
  return React.createElement(
    'main',
    { className: styles.route${p}_0 },
    React.createElement('h1', null, 'route ${p}'),
${body}
  )
}
`
    )
  }

  // ---- root layout / page / config -----------------------------------------
  write(
    path.join(outDir, 'app', 'layout.js'),
    `import * as React from 'react'

export const metadata = { title: 'sync-engine bench' }

export default function RootLayout({ children }) {
  return React.createElement(
    'html',
    { lang: 'en' },
    React.createElement('body', null, children)
  )
}
`
  )
  write(
    path.join(outDir, 'app', 'page.js'),
    `import * as React from 'react'

export default function Home() {
  return React.createElement('main', null, 'sync-engine bench')
}
`
  )
  write(path.join(outDir, 'next.config.js'), `module.exports = {}\n`)
  write(
    path.join(outDir, 'package.json'),
    JSON.stringify(
      {
        name: `sync-engine-bench-${preset}`,
        version: '0.0.0',
        private: true,
        scripts: { build: 'next build', dev: 'next dev' },
      },
      null,
      2
    ) + '\n'
  )
  write(
    path.join(outDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: false,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          jsx: 'preserve',
        },
        include: ['**/*.ts', '**/*.tsx', '**/*.js'],
        exclude: ['node_modules'],
      },
      null,
      2
    ) + '\n'
  )

  const moduleCount =
    cfg.sharedModules + cfg.pages * (cfg.perPageModules + 2) + 2
  return { cfg, moduleCount }
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const preset = args.find((a) => !a.startsWith('--')) || 'medium'
  const outIdx = args.indexOf('--out')
  const outDir =
    outIdx >= 0
      ? path.resolve(args[outIdx + 1])
      : path.join(__dirname, 'generated', preset)

  const { cfg, moduleCount } = generate(preset, outDir)
  console.log(`generated preset '${preset}' -> ${outDir}`)
  console.log(
    `  ${cfg.pages} routes, ${cfg.sharedModules} shared modules, ` +
      `${cfg.perPageModules} modules/route, fanout ${cfg.fanout}, ` +
      `chain depth ${cfg.chainDepth}`
  )
  console.log(`  ~${moduleCount} source modules total`)
}

module.exports = { generate, PRESETS }
