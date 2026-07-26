// Generates the dev-validation benchmark's heavy routes (under app/_generated/
// and app/routes/, both gitignored). Each family isolates a different cost that
// dev-mode Cache Components validation pays per navigation. The "client" family
// is a large tree of distinct `use client` components, stressing the
// validation's client prerender (react-dom/static). The "server" family is the
// same recursive tree as server components, stressing the Flight re-encode plus
// the React owner-stack / createTask work validation re-processes per depth,
// which scales with component count. The "sprite" family is one very large SVG
// server component (many symbols), like a shared icon sprite, stressing Flight
// payload size rather than component count.
//
// The client and server families share the same recursive shape so the only
// variable is where the work lands. Each family's route is nested several
// layout segments deep (see NEST_SEGMENTS): dev validation renders a combined
// payload at every URL depth, so a deeper route means more validation work per
// navigation, mirroring a realistic app rather than a single flat segment. The
// benchmark clicks the family's link repeatedly; navigating to the current
// route re-renders and re-validates it (the reloop "click Overview repeatedly"
// case), so distinct tabs are unnecessary. The routes need no `instant` config:
// dev validation applies to page segments by default at the warning level. To
// build by hand: node bench/dev-validation/scripts/generate.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Bump VERSION whenever the generation logic or shape changes; the marker file
// short-circuits regeneration when nothing changed.
const VERSION = 'v6-3families-nested4-noinstant-48leaves-d4-b3-400symbols'
const LEAF_COMPONENTS = 48
const TREE_DEPTH = 4
const TREE_BRANCH = 3
const LEAVES_PER_BRANCH = 3
const SPRITE_SYMBOLS = 400
const SPRITE_PATHS_PER_SYMBOL = 2

// Intermediate route segments nested under routes/<family>, with the leaf page
// at the end. Each segment adds one URL depth, and dev validation renders a
// combined payload per depth, so this is the primary lever for how much
// validation work each navigation triggers. Keep in sync with app/families.ts.
const NEST_SEGMENTS = ['s1', 's2', 's3', 's4']

// name → kind: 'tree' families share the recursive generator; 'sprite' is the
// big-SVG special case.
const FAMILIES = [
  { name: 'client', kind: 'tree', isClient: true },
  { name: 'server', kind: 'tree', isClient: false },
  { name: 'sprite', kind: 'sprite' },
]

const appDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'app'
)
const generatedDir = path.join(appDir, '_generated')
// A route group (parenthesized), so it organizes the generated routes without
// adding a URL segment or a validation depth of its own. The URL depth comes
// from the family segment and NEST_SEGMENTS below it.
const routesDir = path.join(appDir, '(routes)')
const marker = path.join(generatedDir, '.generated')

if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === VERSION) {
  process.exit(0)
}

fs.rmSync(generatedDir, { recursive: true, force: true })
fs.rmSync(routesDir, { recursive: true, force: true })
fs.mkdirSync(generatedDir, { recursive: true })
fs.mkdirSync(routesDir, { recursive: true })

function leavesSource(isClient) {
  const parts = []
  if (isClient) {
    parts.push("'use client'", '', 'import { useMemo } from "react"', '')
  }
  parts.push('// Generated leaf components. See scripts/generate.mjs.', '')
  for (let k = 0; k < LEAF_COMPONENTS; k++) {
    const prime = 97 + k * 2
    const value = isClient
      ? `  const value = useMemo(() => (n * ${prime} + ${k}) % 100003, [n])`
      : `  const value = (n * ${prime} + ${k}) % 100003`
    parts.push(
      `export function Leaf${k}({ n }: { n: number }) {`,
      value,
      `  return <span className="leaf leaf-${k}" data-leaf={${k}}>{value}</span>`,
      `}`,
      ''
    )
  }
  return parts.join('\n')
}

function treeSource(isClient) {
  const names = Array.from({ length: LEAF_COMPONENTS }, (_, k) => `Leaf${k}`)
  const directive = isClient ? "'use client'\n\n" : ''
  return `${directive}// Generated heavy ${isClient ? 'client' : 'server'} tree. See scripts/generate.mjs.

import { ${names.join(', ')} } from './leaves'

const LEAVES = [${names.join(', ')}]

const DEPTH = ${TREE_DEPTH}
const BRANCH = ${TREE_BRANCH}
const LEAVES_PER_BRANCH = ${LEAVES_PER_BRANCH}

function Branch({
  seed,
  depth,
  path,
}: {
  seed: number
  depth: number
  path: number
}) {
  const children = []
  for (let i = 0; i < LEAVES_PER_BRANCH; i++) {
    const Leaf = LEAVES[(seed + depth * 7 + path + i) % LEAVES.length]
    children.push(<Leaf key={\`l\${i}\`} n={seed + depth * 31 + path + i} />)
  }
  if (depth > 0) {
    for (let i = 0; i < BRANCH; i++) {
      children.push(
        <Branch
          key={\`b\${i}\`}
          seed={seed * 31 + i}
          depth={depth - 1}
          path={path * BRANCH + i}
        />
      )
    }
  }
  return (
    <div className="branch" data-depth={depth}>
      {children}
    </div>
  )
}

export function HeavyTree({ seed }: { seed: number }) {
  return <Branch seed={seed} depth={DEPTH} path={0} />
}
`
}

function spriteSource() {
  // One large static SVG server component, shaped like a shared icon sprite:
  // many <symbol>s with a few <path>s each. This is payload-heavy but has few
  // distinct components, isolating Flight size from component count.
  const symbols = []
  for (let s = 0; s < SPRITE_SYMBOLS; s++) {
    const paths = []
    for (let p = 0; p < SPRITE_PATHS_PER_SYMBOL; p++) {
      const coords = Array.from({ length: 8 }, (_, i) => {
        const x = ((s * 7 + p * 13 + i * 3) % 24).toFixed(2)
        const y = ((s * 11 + p * 5 + i * 2) % 24).toFixed(2)
        return `${x} ${y}`
      }).join(' L ')
      paths.push(`      <path d={\`M ${coords} Z\`} />`)
    }
    symbols.push(
      `    <symbol id="icon-${s}" viewBox="0 0 24 24">`,
      ...paths,
      `    </symbol>`
    )
  }
  return `// Generated large SVG sprite server component. See scripts/generate.mjs.

export function BigSprite() {
  return (
    <svg
      width={0}
      height={0}
      aria-hidden="true"
      style={{ position: 'absolute' }}
    >
${symbols.join('\n')}
    </svg>
  )
}
`
}

// `../` repeated n times, for import paths from a nested route file back up to
// the app directory (which holds _generated/).
function up(n) {
  return '../'.repeat(n)
}

// The top layout for a family (at routes/<family>/). For the sprite family it
// renders the sprite here, in a shared layout, so the sprite is part of the
// validation payload at every route depth (mirroring the reloop case, where a
// large shared-layout server component dominates each validation render). For
// the tree families it is a plain wrapper; the heavy tree lives at the leaf.
function topLayoutSource(family) {
  if (family === 'sprite') {
    return `import { BigSprite } from '${up(2)}_generated/sprite-tree'

// Generated. See scripts/generate.mjs.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BigSprite />
      {children}
    </>
  )
}
`
  }
  return `// Generated. See scripts/generate.mjs.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div data-family="${family}">{children}</div>
}
`
}

function segmentLayoutSource(segment) {
  return `// Generated. See scripts/generate.mjs.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div data-seg="${segment}">{children}</div>
}
`
}

function leafPageSource(family, depthFromApp) {
  if (family === 'sprite') {
    return `// Generated. See scripts/generate.mjs. The sprite renders in the
// shared layout above, so the leaf page only carries the route marker.
export default function Page() {
  return <h1 id="route">sprite</h1>
}
`
  }
  return `import { HeavyTree } from '${up(depthFromApp)}_generated/${family}-tree'

// Generated. See scripts/generate.mjs.
export default function Page() {
  return (
    <section>
      <h1 id="route">${family}</h1>
      <HeavyTree seed={7} />
    </section>
  )
}
`
}

for (const family of FAMILIES) {
  const { name } = family
  fs.mkdirSync(path.join(generatedDir, name), { recursive: true })
  if (family.kind === 'tree') {
    fs.writeFileSync(
      path.join(generatedDir, name, 'leaves.tsx'),
      leavesSource(family.isClient)
    )
    fs.writeFileSync(
      path.join(generatedDir, name, 'tree.tsx'),
      treeSource(family.isClient)
    )
    fs.writeFileSync(
      path.join(generatedDir, `${name}-tree.tsx`),
      `export { HeavyTree } from './${name}/tree'\n`
    )
  } else {
    fs.writeFileSync(
      path.join(generatedDir, name, 'sprite.tsx'),
      spriteSource()
    )
    fs.writeFileSync(
      path.join(generatedDir, `${name}-tree.tsx`),
      `export { BigSprite } from './${name}/sprite'\n`
    )
  }

  // Nested route: routes/<name>/ has the top layout, then one layout per
  // intermediate NEST_SEGMENT, and the page at the deepest segment. Each
  // segment is one more URL depth for dev validation to render.
  const familyRouteDir = path.join(routesDir, name)
  fs.mkdirSync(familyRouteDir, { recursive: true })
  fs.writeFileSync(
    path.join(familyRouteDir, 'layout.tsx'),
    topLayoutSource(name)
  )

  // Depth of the leaf page's directory below app/: routes + <name> + segments.
  const leafDepthFromApp = 2 + NEST_SEGMENTS.length
  let dir = familyRouteDir
  NEST_SEGMENTS.forEach((segment, index) => {
    dir = path.join(dir, segment)
    fs.mkdirSync(dir, { recursive: true })
    if (index < NEST_SEGMENTS.length - 1) {
      fs.writeFileSync(
        path.join(dir, 'layout.tsx'),
        segmentLayoutSource(segment)
      )
    } else {
      fs.writeFileSync(
        path.join(dir, 'page.tsx'),
        leafPageSource(name, leafDepthFromApp)
      )
    }
  })
}

// The family list and nested segments are duplicated (as small, stable
// constants) in the committed app/families.ts, so the hand-written layout/page
// stay self-contained and type-check without depending on generated output.
// Keep the two in sync.

fs.writeFileSync(marker, VERSION)
process.stdout.write(
  `generated ${FAMILIES.length} routes nested ${NEST_SEGMENTS.length} deep ` +
    `(client/server: depth ${TREE_DEPTH} branch ${TREE_BRANCH}, ${LEAF_COMPONENTS} leaves; ` +
    `sprite: ${SPRITE_SYMBOLS} symbols)\n`
)
