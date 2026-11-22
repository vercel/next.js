// Generates a large, representative App Router application used to benchmark
// how `next build` / `next dev` scale with the number of CPU cores.
//
// The output is deterministic: the same arguments always produce
// byte-identical files. Everything this script writes (app/, components/,
// lib/) is gitignored and removed before regenerating.
//
// Usage:
//   node scripts/generate.mjs [--routes 5000] [--components 3000] [--seed 1]
//
// See README.md for details.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const { values: args } = parseArgs({
  options: {
    routes: { type: 'string', default: '5000' },
    components: { type: 'string', default: '3000' },
    seed: { type: 'string', default: '1' },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (args.help) {
  console.log(`Usage: node scripts/generate.mjs [options]

Options:
  --routes <n>      Number of page routes (default: 5000)
  --components <n>  Size of the shared component library (default: 3000)
  --seed <n>        PRNG seed (default: 1)

Derived sizes: sections = routes / 50, utility modules = components / 4,
route handlers = routes / 10.`)
  process.exit(0)
}

function positiveInt(name) {
  const n = Number(args[name])
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`--${name} must be a positive integer, got ${args[name]}`)
    process.exit(1)
  }
  return n
}

const ROUTES = positiveInt('routes')
const COMPONENTS = positiveInt('components')
const SEED = positiveInt('seed')
const SECTIONS = Math.max(1, Math.round(ROUTES / 50))
const UTILS = Math.max(8, Math.round(COMPONENTS / 4))
const API_ROUTES = Math.max(1, Math.round(ROUTES / 10))

// mulberry32: tiny deterministic PRNG.
let state = SEED >>> 0
function random() {
  state = (state + 0x6d2b79f5) >>> 0
  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const int = (min, max) => min + Math.floor(random() * (max - min + 1))
const chance = (p) => random() < p
const pick = (arr) => arr[Math.floor(random() * arr.length)]
function pickN(arr, n) {
  const copy = arr.slice()
  const out = []
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(random() * copy.length), 1)[0])
  }
  return out
}
const color = () => '#' + int(0, 0xffffff).toString(16).padStart(6, '0')

const ICONS = [
  'Activity',
  'AlarmClock',
  'Archive',
  'ArrowRight',
  'Bell',
  'Book',
  'Calendar',
  'Camera',
  'Check',
  'ChevronDown',
  'Clock',
  'Cloud',
  'Code',
  'Copy',
  'Database',
  'Download',
  'Eye',
  'File',
  'Filter',
  'Folder',
  'Globe',
  'Heart',
  'Image',
  'Inbox',
  'Info',
  'Key',
  'Layers',
  'Link',
  'List',
  'Lock',
  'Mail',
  'Map',
  'Menu',
  'Mic',
  'Moon',
  'Music',
  'Package',
  'Paperclip',
  'Pause',
  'Phone',
  'Play',
  'Plus',
  'Printer',
  'Search',
  'Send',
  'Settings',
  'Share',
  'Shield',
  'ShoppingCart',
  'Star',
  'Sun',
  'Tag',
  'Terminal',
  'Truck',
  'Upload',
  'User',
  'Users',
  'Video',
  'Wifi',
  'Zap',
]
const LODASH = [
  'groupBy',
  'sortBy',
  'uniqBy',
  'chunk',
  'debounce',
  'throttle',
  'pick',
  'omit',
  'merge',
  'camelCase',
  'kebabCase',
  'sumBy',
  'partition',
  'keyBy',
  'flatMap',
]
const WORDS = (
  'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima ' +
  'mike november oscar papa quebec romeo sierra tango uniform victor whiskey ' +
  'xray yankee zulu account billing catalog dashboard editor feed gallery ' +
  'invoice ledger metrics notes orders profile report settings team usage'
).split(' ')
const words = (n) => Array.from({ length: n }, () => pick(WORDS)).join(' ')

// ---------------------------------------------------------------------------
// File writing

let fileCount = 0
function write(rel, content) {
  const file = path.join(ROOT, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content.replace(/^\n/, ''))
  fileCount++
}

for (const dir of ['app', 'components', 'lib']) {
  fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true })
}

function cssModule(classes) {
  return classes
    .map(
      (name) => `.${name} {
  display: ${pick(['flex', 'grid', 'block'])};
  gap: ${int(2, 24)}px;
  padding: ${int(0, 32)}px ${int(0, 32)}px;
  margin: ${int(0, 16)}px 0;
  color: ${color()};
  background: ${color()};
  border: ${int(0, 3)}px solid ${color()};
  border-radius: ${int(0, 12)}px;
  font-size: ${(0.75 + random()).toFixed(2)}rem;
}

.${name}:hover {
  background: ${color()};
  transform: translateY(-${int(0, 4)}px);
}
`
    )
    .join('\n')
}

// ---------------------------------------------------------------------------
// lib/: plain TypeScript utility modules (data shaping, validation, formatting).
// The first half are base modules; the second half each build on 1-2 base
// modules. Keeping the graph shallow keeps every module's transitive closure
// small, so the total work grows linearly with the app size.

const baseUtils = [...Array(Math.ceil(UTILS / 2)).keys()]
for (let i = 0; i < UTILS; i++) {
  const deps = i < baseUtils.length ? [] : pickN(baseUtils, int(1, 2))
  const lodash = pickN(LODASH, int(1, 3))
  const useZod = chance(0.4)
  const useDayjs = chance(0.3)
  write(
    `lib/u${i}.ts`,
    `
import { ${lodash.join(', ')} } from 'lodash-es'
${useZod ? `import { z } from 'zod'\n` : ''}${useDayjs ? `import dayjs from 'dayjs'\n` : ''}${deps.map((d) => `import { transform${d} } from './u${d}'\n`).join('')}
export interface Item${i} {
  id: number
  name: string
  group: string
  value: number
  tags: string[]
}
${
  useZod
    ? `
export const schema${i} = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1).max(${int(20, 200)}),
  group: z.enum(['${pick(WORDS)}', '${pick(WORDS)}', '${pick(WORDS)}']).or(z.string()),
  value: z.number(),
  tags: z.array(z.string()).max(${int(4, 16)}),
})
`
    : ''
}
export function createItems${i}(count: number = ${int(5, 30)}): Item${i}[] {
  const items: Item${i}[] = []
  for (let n = 0; n < count; n++) {
    items.push({
      id: n,
      name: '${words(2)} ' + n,
      group: ['${pick(WORDS)}', '${pick(WORDS)}', '${pick(WORDS)}'][n % 3],
      value: (n * ${int(3, 97)}) % ${int(50, 500)},
      tags: ['${pick(WORDS)}', '${pick(WORDS)}'].slice(0, (n % 2) + 1),
    })
  }
  return items
}

export function transform${i}(items: Item${i}[]): Item${i}[] {
  let result = items${deps.map((d) => `\n  result = transform${d}(result as any) as any`).join('')}
  ${
    lodash.includes('sortBy')
      ? `result = sortBy(result, ['group', 'value'])`
      : lodash.includes('uniqBy')
        ? `result = uniqBy(result, 'name')`
        : `result = result.filter((item) => item.value % ${int(2, 7)} !== 0)`
  }
  return result${useZod ? `.filter((item) => schema${i}.safeParse(item).success)` : ''}
}

export function summarize${i}(items: Item${i}[]) {
  const total = items.reduce((acc, item) => acc + item.value, 0)
  const groups = new Map<string, number>()
  for (const item of items) {
    groups.set(item.group, (groups.get(item.group) ?? 0) + item.value)
  }
  return {
    total,
    average: items.length ? total / items.length : 0,
    groups: Array.from(groups.entries()),
    label: ${
      lodash.includes('camelCase')
        ? `camelCase('${words(3)}')`
        : lodash.includes('kebabCase')
          ? `kebabCase('${words(3)}')`
          : `'${words(3)}'`
    },
    ${useDayjs ? `date: dayjs(0).add(${int(0, 3650)}, 'day').format('YYYY-MM-DD'),` : `date: '1970-01-01',`}
  }
}

export const helpers${i} = { ${lodash.join(', ')} }
`
  )
}

// ---------------------------------------------------------------------------
// components/: shared component library, layered like a design system:
// primitives (40%), molecules (30%), organisms (20%) and templates (10%).
// Components import 1-3 components from lower layers, so the library is a
// DAG with shared subtrees but a bounded depth (and bounded closure size).
// About a third of them are client components.

const LAYER_BOUNDS = [0.4, 0.7, 0.9, 1].map((f) =>
  Math.max(1, Math.round(COMPONENTS * f))
)
const layerOf = (i) => LAYER_BOUNDS.findIndex((bound) => i < bound)
const isClient = []
for (let i = 0; i < COMPONENTS; i++) {
  const client = chance(0.35)
  isClient.push(client)
  const layer = layerOf(i)
  const lowerLayers =
    layer > 0 ? [...Array(LAYER_BOUNDS[layer - 1]).keys()] : []
  const deps = layer > 0 ? pickN(lowerLayers, int(1, 3)) : []
  const util = int(0, UTILS - 1)
  const icons = chance(0.5) ? pickN(ICONS, int(1, 3)) : []
  const lazyUtil = client && chance(0.3) ? int(0, UTILS - 1) : null
  const name = `C${i}`
  write(
    `components/c${i}/${name}.module.css`,
    cssModule(['root', 'title', 'body', 'item'])
  )
  write(
    `components/c${i}/${name}.tsx`,
    `
${client ? `'use client'\n\n` : ''}${client ? `import { useState, useMemo${chance(0.5) ? ', useEffect' : ''} } from 'react'\n` : ''}import clsx from 'clsx'
${icons.length ? `import { ${icons.join(', ')} } from 'lucide-react'\n` : ''}import styles from './${name}.module.css'
import { createItems${util}, transform${util}, summarize${util} } from '@/lib/u${util}'
${deps.map((d) => `import { C${d} } from '@/components/c${d}/C${d}'\n`).join('')}
export interface ${name}Props {
  title?: string
  variant?: 'primary' | 'secondary' | 'ghost'
  count?: number
  depth?: number
}

export function ${name}({ title = '${words(2)}', variant = 'primary', count = ${int(3, 12)}, depth = 0 }: ${name}Props) {
${
  client
    ? `  const [open, setOpen] = useState(${chance(0.5)})
  const [selected, setSelected] = useState<number | null>(null)
${lazyUtil !== null ? `  const [extra, setExtra] = useState<string | null>(null)\n` : ''}  const items = useMemo(() => transform${util}(createItems${util}(count)), [count])
`
    : `  const items = transform${util}(createItems${util}(count))
`
}  const summary = summarize${util}(items)
  return (
    <section className={clsx(styles.root, variant === 'ghost' && styles.item)} data-variant={variant}>
      <h3 className={styles.title}>
        ${icons.map((icon) => `<${icon} size={${int(12, 24)}} aria-hidden />`).join(' ')}
        {title} <small>{summary.label}</small>
      </h3>
${
  client
    ? `      <button type="button" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide' : 'Show'} {items.length} items
      </button>
${
  lazyUtil !== null
    ? `      <button
        type="button"
        onClick={async () => {
          const mod = await import('@/lib/u${lazyUtil}')
          setExtra(String(mod.summarize${lazyUtil}(mod.createItems${lazyUtil}()).total))
        }}
      >
        Load details
      </button>
      {extra && <p>{extra}</p>}
`
    : ''
}      {open && (
        <ul className={styles.body}>
          {items.map((item) => (
            <li
              key={item.id}
              className={clsx(styles.item, selected === item.id && styles.title)}
              onClick={() => setSelected(item.id)}
            >
              {item.name} - {item.group}: {item.value}
            </li>
          ))}
        </ul>
      )}
`
    : `      <dl className={styles.body}>
        <dt>Total</dt>
        <dd>{summary.total}</dd>
        <dt>Average</dt>
        <dd>{summary.average.toFixed(2)}</dd>
        <dt>Updated</dt>
        <dd>{summary.date}</dd>
      </dl>
      <ul>
        {items.slice(0, ${int(2, 6)}).map((item) => (
          <li key={item.id} className={styles.item}>
            {item.name} <em>{item.tags.join(', ')}</em>
          </li>
        ))}
      </ul>
`
}${
      deps.length
        ? // The import graph is a DAG with shared subtrees. Only render children
          // a couple of levels deep so the rendered tree doesn't grow
          // exponentially, while every import is still bundled.
          `      {depth < 2 && (
        <>
${deps.map((d) => `          <C${d} variant="${pick(['primary', 'secondary', 'ghost'])}" depth={depth + 1} />\n`).join('')}        </>
      )}
`
        : ''
    }    </section>
  )
}

export default ${name}
`
  )
}

// ---------------------------------------------------------------------------
// app/: root layout, sections with nested layouts, pages, route handlers.

const sectionNames = Array.from({ length: SECTIONS }, (_, s) => `s${s}`)

write(
  'app/globals.css',
  `
*,
*::before,
*::after {
  box-sizing: border-box;
}

:root {
  --foreground: ${color()};
  --background: ${color()};
  --accent: ${color()};
  font-family: system-ui, sans-serif;
}

body {
  margin: 0;
  color: var(--foreground);
  background: var(--background);
}

a {
  color: var(--accent);
}
`
)

write(
  'app/layout.module.css',
  cssModule(['shell', 'header', 'nav', 'main', 'footer'])
)
write(
  'app/nav.tsx',
  `
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu } from 'lucide-react'
import styles from './layout.module.css'

const sections: string[] = ${JSON.stringify(sectionNames)}

export function Nav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  return (
    <nav className={styles.nav}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation">
        <Menu size={16} />
      </button>
      {open &&
        sections.map((section) => (
          <Link key={section} href={'/' + section} aria-current={pathname.startsWith('/' + section) ? 'page' : undefined}>
            {section}
          </Link>
        ))}
    </nav>
  )
}
`
)

write(
  'app/layout.tsx',
  `
import type { Metadata } from 'next'
import './globals.css'
import styles from './layout.module.css'
import { Nav } from './nav'

export const metadata: Metadata = {
  title: { default: 'Large App Router benchmark', template: '%s | Large App Router benchmark' },
  description: 'Generated application used to benchmark Next.js builds.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={styles.shell}>
        <header className={styles.header}>
          <Nav />
        </header>
        <main className={styles.main}>{children}</main>
        <footer className={styles.footer}>Generated with seed ${SEED}</footer>
      </body>
    </html>
  )
}
`
)

write(
  'app/page.tsx',
  `
import Link from 'next/link'

const sections: string[] = ${JSON.stringify(sectionNames)}

export default function Home() {
  return (
    <ul>
      {sections.map((section) => (
        <li key={section}>
          <Link href={'/' + section}>{section}</Link>
        </li>
      ))}
    </ul>
  )
}
`
)

const componentIds = [...Array(COMPONENTS).keys()]
let pageCount = 0
let dynamicImportCount = 0

for (let s = 0; s < SECTIONS; s++) {
  const section = sectionNames[s]
  const routesInSection =
    Math.floor(ROUTES / SECTIONS) + (s < ROUTES % SECTIONS ? 1 : 0)
  const sectionComponents = pickN(componentIds, int(2, 4))
  const routeNames = Array.from({ length: routesInSection }, (_, r) => `r${r}`)
  // Concrete URLs, including the generated slug for dynamic routes. The
  // layout and index page are written after the routes so they can link to
  // these without changing the order of random draws.
  const routeHrefs = []

  write(
    `app/${section}/layout.module.css`,
    cssModule(['layout', 'sidebar', 'content'])
  )
  const writeSectionNavigation = () => {
    write(
      `app/${section}/layout.tsx`,
      `
import Link from 'next/link'
import styles from './layout.module.css'
${sectionComponents.map((c) => `import { C${c} } from '@/components/c${c}/C${c}'\n`).join('')}
const routes: string[] = ${JSON.stringify(routeHrefs.slice(0, 20))}

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        ${sectionComponents.map((c) => `<C${c} title="${section}" />`).join('\n        ')}
        <ul>
          {routes.map((route) => (
            <li key={route}>
              <Link href={route}>{route}</Link>
            </li>
          ))}
        </ul>
      </aside>
      <div className={styles.content}>{children}</div>
    </div>
  )
}
`
    )
    write(
      `app/${section}/page.tsx`,
      `
import Link from 'next/link'

const routes: string[] = ${JSON.stringify(routeHrefs)}

export default function SectionIndex() {
  return (
    <ul>
      {routes.map((route) => (
        <li key={route}>
          <Link href={route}>{route}</Link>
        </li>
      ))}
    </ul>
  )
}
`
    )
  }
  write(
    `app/${section}/loading.tsx`,
    `
export default function Loading() {
  return <p>Loading ${section}...</p>
}
`
  )
  write(
    `app/${section}/error.tsx`,
    `
'use client'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert">
      <p>Something went wrong in ${section}: {error.message}</p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </div>
  )
}
`
  )

  for (let r = 0; r < routesInSection; r++) {
    // A tenth of the routes are dynamic segments with generateStaticParams.
    const dynamicSegment = chance(0.1)
    const dir = `app/${section}/${routeNames[r]}${dynamicSegment ? '/[slug]' : ''}`
    const used = pickN(componentIds, int(3, 8))
    const lazy = chance(0.3) ? pickN(componentIds, int(1, 2)) : []
    const widget = chance(0.5)
    const nestedLayout = chance(0.15)
    const util = int(0, UTILS - 1)
    let firstSlug = null
    dynamicImportCount += lazy.length
    pageCount++

    write(`${dir}/page.module.css`, cssModule(['page', 'hero', 'grid', 'card']))
    if (widget) {
      const icon = pick(ICONS)
      write(
        `${dir}/widget.tsx`,
        `
'use client'

import { useEffect, useState } from 'react'
import { ${icon} } from 'lucide-react'
import { debounce } from 'lodash-es'
import styles from './page.module.css'

export function Widget({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial)
  const [query, setQuery] = useState('')
  useEffect(() => {
    const id = setInterval(() => setValue((v) => (v + ${int(1, 9)}) % ${int(100, 1000)}), ${int(1, 5) * 1000})
    return () => clearInterval(id)
  }, [])
  const onChange = debounce((next: string) => setQuery(next), ${int(50, 300)})
  return (
    <div className={styles.card}>
      <${icon} size={18} />
      <input placeholder="${words(2)}" onChange={(e) => onChange(e.target.value)} />
      <output>
        {value} {query}
      </output>
    </div>
  )
}
`
      )
    }
    if (nestedLayout) {
      write(
        `app/${section}/${routeNames[r]}/layout.tsx`,
        `
export default function RouteLayout({ children }: { children: React.ReactNode }) {
  return (
    <article data-route="${section}/${routeNames[r]}">
      <h1>${words(3)}</h1>
      {children}
    </article>
  )
}
`
      )
    }
    write(
      `${dir}/page.tsx`,
      `
import type { Metadata } from 'next'
${lazy.length ? `import dynamic from 'next/dynamic'\n` : ''}import styles from './page.module.css'
import { createItems${util}, summarize${util} } from '@/lib/u${util}'
${used.map((c) => `import { C${c} } from '@/components/c${c}/C${c}'\n`).join('')}${widget ? `import { Widget } from './widget'\n` : ''}
${lazy.map((c) => `const Lazy${c} = dynamic(() => import('@/components/c${c}/C${c}').then((mod) => mod.C${c}))\n`).join('')}
export const metadata: Metadata = {
  title: '${section} ${routeNames[r]}',
  description: '${words(8)}',
}
${
  dynamicSegment
    ? `
export function generateStaticParams() {
  return [{ slug: '${(firstSlug = pick(WORDS))}' }, { slug: '${pick(WORDS)}-2' }]
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params`
    : `
export default function Page() {
  const slug = '${routeNames[r]}'`
}
  const summary = summarize${util}(createItems${util}())
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h2>
          ${section} / {slug}
        </h2>
        <p>
          ${words(12)} Total: {summary.total}
        </p>
      </header>
      <div className={styles.grid}>
        ${used.map((c) => `<C${c} title="${words(2)}" count={${int(2, 10)}} />`).join('\n        ')}
        ${lazy.map((c) => `<Lazy${c} />`).join('\n        ')}
      </div>
      ${widget ? `<Widget initial={${int(0, 100)}} />` : ''}
    </div>
  )
}
`
    )
    routeHrefs.push(
      `/${section}/${routeNames[r]}${dynamicSegment ? `/${firstSlug}` : ''}`
    )
  }
  writeSectionNavigation()
}

for (let a = 0; a < API_ROUTES; a++) {
  const util = int(0, UTILS - 1)
  const dynamicRoute = chance(0.5)
  write(
    `app/api/r${a}/route.ts`,
    `
import { z } from 'zod'
import { createItems${util}, transform${util}, summarize${util} } from '@/lib/u${util}'
${dynamicRoute ? `\nexport const dynamic = 'force-dynamic'\n` : ''}
const query = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(${int(5, 50)}),
  group: z.string().optional(),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = query.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const items = transform${util}(createItems${util}(parsed.data.limit)).filter(
    (item) => !parsed.data.group || item.group === parsed.data.group
  )
  return Response.json({ items, summary: summarize${util}(items) })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  return Response.json({ received: body, route: 'r${a}' }, { status: 201 })
}
`
  )
}

const summary = {
  seed: SEED,
  routes: pageCount,
  sections: SECTIONS,
  components: COMPONENTS,
  clientComponents: isClient.filter(Boolean).length,
  utilityModules: UTILS,
  routeHandlers: API_ROUTES,
  dynamicImports: dynamicImportCount,
  files: fileCount,
}
console.log('Generated large-app-router:')
console.table(summary)
