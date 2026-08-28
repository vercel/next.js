/**
 * Prerendered OG images under Cache Components: asset IO must happen at
 * module scope (or inside a cached scope), not in the handler
 *
 * Under `cacheComponents: true`, an `opengraph-image.tsx` (ImageResponse)
 * route whose handler does `await readFile(...)` for its font at render time
 * is performing uncached IO, so the build silently stops prerendering it:
 * `next build` stays green but the route table flips from
 * `● /posts/<slug>/opengraph-image` (SSG) to `ƒ` (on-demand), no
 * `.next/server/app/posts/<slug>/opengraph-image.body` PNGs are emitted, and
 * the prerender manifest loses the image routes. No error or warning names
 * the cause. The canonical fix (docs commit d44ee523d8, 2026-07-09; see
 * test/e2e/app-dir/use-cache-og-image-top-level-await and
 * use-cache-metadata-route-handler in the Next.js repo) is to hoist the
 * `readFile` to module scope with a top-level await; wrapping the font read
 * in a `'use cache'` helper also legitimately restores prerendering, so the
 * assertions below are outcome-based (build artifacts) rather than
 * mechanism-based.
 *
 * Why agents fail: every pre-2026 example loaded fonts inside the handler
 * (that pattern prerendered fine before Cache Components), and the failure is
 * silent — nothing points at the handler-scope IO. Common wrong turns, all
 * verified on next 16.4.0-canary.10: `'use cache'` on the whole handler
 * (build fails with a misleading "Only plain objects ... can be passed to
 * Client Components" serialization error, digest 3691872775, because
 * ImageResponse is not cache-serializable), `export const dynamic =
 * 'force-static'` (hard build error: segment config removed under Cache
 * Components), or disabling `cacheComponents` in next.config.ts (changes the
 * pages' rendering mode, which the prompt forbids).
 */

import { beforeAll, expect, test } from 'vitest'
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SLUGS = ['hello-world', 'ship-faster']

function cleanEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
  }
  // vitest sets NODE_ENV=test, which breaks `next build`.
  delete env.NODE_ENV
  return env as unknown as NodeJS.ProcessEnv
}

beforeAll(() => {
  // The agent's turn may have left a stale .next behind; judge a clean build.
  rmSync(join(ROOT, '.next'), { recursive: true, force: true })
  execSync('npx next build', {
    cwd: ROOT,
    stdio: 'pipe',
    env: cleanEnv(),
    timeout: 600_000,
  })
}, 800_000)

/** All fixture .ts/.tsx sources, excluding node_modules, .next, and EVAL. */
function sourceFiles(): string[] {
  const out: string[] = []
  const entries = readdirSync(ROOT, { recursive: true, withFileTypes: true })
  for (const d of entries) {
    if (!d.isFile()) continue
    if (!/\.(ts|tsx)$/.test(d.name)) continue
    const parent = (d as any).parentPath ?? (d as any).path
    const p = join(parent, d.name)
    if (
      p.includes('node_modules') ||
      p.includes('.next') ||
      /EVAL/i.test(d.name)
    ) {
      continue
    }
    out.push(p)
  }
  return out
}

/** Crude comment stripper so bans/checks ignore prose in comments. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function combinedSource(): string {
  return sourceFiles()
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n')
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

test('the build emits the share image bytes for every post', () => {
  const bodies: Buffer[] = []
  for (const slug of SLUGS) {
    const bodyPath = join(
      ROOT,
      '.next',
      'server',
      'app',
      'posts',
      slug,
      'opengraph-image.body'
    )
    expect(
      existsSync(bodyPath),
      `expected prerendered image at ${bodyPath}`
    ).toBe(true)
    const bytes = readFileSync(bodyPath)
    expect(bytes.length).toBeGreaterThan(1024)
    expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE)
    bodies.push(bytes)

    const meta = JSON.parse(
      readFileSync(
        join(ROOT, '.next', 'server', 'app', 'posts', slug, 'opengraph-image.meta'),
        'utf8'
      )
    )
    expect(meta.status).toBe(200)
    expect(meta.headers['content-type']).toBe('image/png')
  }
  // Per-post cards must actually differ (different titles), not one shared
  // placeholder image for all posts.
  expect(bodies[0].equals(bodies[1])).toBe(false)
})

test('the prerender manifest lists the image route for every post', () => {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, '.next', 'prerender-manifest.json'), 'utf8')
  )
  for (const slug of SLUGS) {
    expect(manifest.routes).toHaveProperty(`/posts/${slug}/opengraph-image`)
    // The pages themselves must still be prerendered too.
    expect(manifest.routes).toHaveProperty(`/posts/${slug}`)
  }
})

test('the post page component is untouched', () => {
  const expected = `import { getAllSlugs, posts } from '../../../lib/posts'

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = posts[slug]
  return (
    <main>
      <h1>{post.title}</h1>
      <p>{post.excerpt}</p>
    </main>
  )
}

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}
`
  const actual = readFileSync(
    join(ROOT, 'app', 'posts', '[slug]', 'page.tsx'),
    'utf8'
  )
  expect(actual).toBe(expected)
})

test('the framework config is unchanged and no removed segment configs crept in', () => {
  const config = stripComments(readFileSync(join(ROOT, 'next.config.ts'), 'utf8'))
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).not.toMatch(/cacheComponents\s*:\s*false/)

  // Segment configs like `dynamic` were removed under Cache Components; any
  // solution leaning on them is wrong (and would fail the build anyway).
  for (const file of sourceFiles()) {
    const src = stripComments(readFileSync(file, 'utf8'))
    expect(src, `unexpected segment config in ${file}`).not.toMatch(
      /export\s+const\s+dynamic\b/
    )
  }
})

test('the share card is still drawn with the brand font at build time', () => {
  const source = stripComments(combinedSource())
  // Still an ImageResponse-based image route (any import style is fine)...
  expect(source).toMatch(/from\s+['"]next\/og['"]/)
  expect(source).toMatch(/ImageResponse/)
  // ...that still uses the local brand font file, wherever it now lives.
  expect(source).toMatch(/brand\.ttf/)
})
