// Source checks for nextjs/clean-checkout-route-types.
//
// These reject repairs that make CI green by weakening the type contract:
// hand-written copies of the generated route types, loosened compiler
// settings, suppressed errors, or a typecheck script that no longer fails.
// They also confirm the app still relies on the generated types, since the
// task is to make those types available in CI rather than to remove them.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'

const root = process.env.EVAL_APP_ROOT ?? '/app'
// Parse tsconfig with the project's own TypeScript so comments and trailing
// commas are handled the way tsc handles them.
const ts = createRequire(join(root, 'package.json'))('typescript')
const ignore = new Set(['.git', '.next', 'node_modules'])

function readTree(directory) {
  return readdirSync(directory).flatMap((entry) => {
    if (ignore.has(entry)) return []
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return readTree(path)
    if (!/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry)) return []
    return [[relative(root, path), readFileSync(path, 'utf8')]]
  })
}

function fail(message) {
  throw new Error(message)
}

const files = readTree(root)
const read = (path) =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null

// 1. Compiler settings stay strict.
const parsed = ts.parseConfigFileTextToJson(
  'tsconfig.json',
  read('tsconfig.json') ?? '{}'
)
if (parsed.error) fail('tsconfig.json must be valid.')
const options = parsed.config?.compilerOptions ?? {}
if (options.strict !== true) fail('tsconfig.json must keep strict: true.')
for (const key of [
  'strictNullChecks',
  'noImplicitAny',
  'strictFunctionTypes',
  'strictPropertyInitialization',
]) {
  if (options[key] === false) fail(`tsconfig.json must not disable ${key}.`)
}

// 2. The build still type-checks and the typecheck script still runs tsc and
//    can fail.
const nextConfig =
  (read('next.config.ts') ?? '') + (read('next.config.mjs') ?? '')
if (/ignoreBuildErrors\s*:\s*true/.test(nextConfig)) {
  fail('next.config must not set typescript.ignoreBuildErrors.')
}

const pkg = JSON.parse(read('package.json') ?? '{}')
const typecheck = pkg.scripts?.typecheck ?? ''
if (!/\btsc\b/.test(typecheck)) {
  fail('The typecheck script must still run tsc.')
}
if (
  /\|\|\s*(true|exit\s+0)|;\s*true\s*$|--noCheck|--skipLibCheck\s+false/.test(
    typecheck
  )
) {
  fail('The typecheck script must be able to fail.')
}

// 3. No hand-written framework types, suppressed errors, or escape hatches.
const forbidden = [
  [/\bdeclare\s+global\b/, 'Do not declare global types by hand.'],
  [
    /\b(?:type|interface)\s+(?:PageProps|LayoutProps|RouteContext)\b/,
    'Do not hand-write PageProps, LayoutProps, or RouteContext.',
  ],
  [/@ts-(?:ignore|expect-error|nocheck)\b/, 'Do not suppress type errors.'],
  [
    /\bas\s+any\b|:\s*any\b|\bas\s+unknown\s+as\b/,
    'Do not loosen types with any or double casts.',
  ],
]

for (const [path, contents] of files) {
  for (const [pattern, message] of forbidden) {
    if (pattern.test(contents)) fail(`${message} (${path})`)
  }
}

// 4. The generated route types remain in use where the app used them.
const expectations = [
  [
    'app/(marketing)/layout.tsx',
    /LayoutProps</,
    'The marketing layout must keep using LayoutProps.',
  ],
  [
    'app/dashboard/layout.tsx',
    /LayoutProps</,
    'The dashboard layout must keep using LayoutProps.',
  ],
  [
    'app/dashboard/projects/[project]/page.tsx',
    /PageProps</,
    'The project page must keep using PageProps.',
  ],
  [
    'app/docs/[...slug]/page.tsx',
    /PageProps</,
    'The docs page must keep using PageProps.',
  ],
  [
    'app/api/projects/[project]/route.ts',
    /RouteContext</,
    'The API route must keep using RouteContext.',
  ],
]

for (const [path, pattern, message] of expectations) {
  const contents = read(path)
  if (contents === null) fail(`${path} must still exist.`)
  if (!pattern.test(contents)) fail(message)
}

const dashboardLayout = read('app/dashboard/layout.tsx')
if (
  !/\bstats\b/.test(dashboardLayout) ||
  !/\bactivity\b/.test(dashboardLayout)
) {
  fail('The dashboard layout must keep rendering both parallel slots.')
}
