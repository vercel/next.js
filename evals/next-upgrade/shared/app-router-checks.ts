import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { environment, transcript } from '@vercel/agent-eval/eval'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from '@playwright/test'

// Forked from future-checks.ts. These assertions retain the migration-hard
// fixture's behavior while checking the complete Future result in production.
export function appRouterChecks() {
  const tools = '/tmp/next-upgrade-eval'
  const { source, target } = JSON.parse(
    readFileSync(join(tools, 'security/assessment.json'), 'utf8')
  ) as { source: string; target: string }
  const { head: baseline } = JSON.parse(
    readFileSync(join(tools, 'baseline.json'), 'utf8')
  ) as { head: string }
  const npm = JSON.parse(
    readFileSync(join(tools, 'package-runner.json'), 'utf8')
  ).npm as string
  const git = (...args: string[]) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim()
  const evidence = join(process.cwd(), 'eval-evidence')
  let server: ChildProcess | null = null
  let browser: Browser | null = null
  let serverOutput = ''
  let url = ''
  let distDir = '.next'

  beforeAll(async () => {
    expect(
      JSON.parse(git('show', `${baseline}:package.json`)).dependencies.next
    ).toBe(source)
    expect(
      JSON.parse(readFileSync('package.json', 'utf8')).dependencies.next
    ).toBe(target)
    mkdirSync(evidence, { recursive: true })

    // Use the installed app's effective config, including adapters and config
    // functions, instead of assuming literal flags in next.config.js.
    const config = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '-e',
          `
      const loadConfig = require('next/dist/server/config').default;
      const { PHASE_PRODUCTION_BUILD } = require('next/constants');
      loadConfig(PHASE_PRODUCTION_BUILD, process.cwd(), { silent: true })
        .then(config => process.stdout.write(JSON.stringify({
          cacheComponents: config.cacheComponents,
          partialPrefetching: config.partialPrefetching,
          distDir: config.distDir
        })))
        .catch(error => { console.error(error); process.exitCode = 1; });
    `,
        ],
        { encoding: 'utf8' }
      )
    )
    expect(config.cacheComponents).toBe(true)
    expect(config.partialPrefetching).toBe(true)
    distDir = config.distDir

    try {
      const output = execFileSync(npm, ['run', 'build'], {
        encoding: 'utf8',
        timeout: 600_000,
        maxBuffer: 16 * 1024 * 1024,
      })
      writeFileSync(join(evidence, 'production-build.log'), output)
    } catch (error) {
      const failure = error as {
        stdout: string | undefined
        stderr: string | undefined
      }
      writeFileSync(
        join(evidence, 'production-build.log'),
        `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`
      )
      throw error
    }

    server = spawn(npm, ['run', 'start', '--', '--port', '0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    })
    server.stdout!.on('data', (chunk) => {
      serverOutput += chunk.toString()
    })
    server.stderr!.on('data', (chunk) => {
      serverOutput += chunk.toString()
    })
    await vi.waitFor(
      async () => {
        url = serverOutput.match(/http:\/\/localhost:\d+/)?.[0] ?? ''
        expect(url.length).toBeGreaterThan(0)
        expect((await fetch(url)).status).toBe(200)
      },
      { timeout: 60_000 }
    )
    browser = await chromium.launch({ headless: true })
  }, 660_000)

  afterAll(async () => {
    await browser?.close()
    if (server?.pid) {
      try {
        if (process.platform === 'win32') {
          server.kill('SIGTERM')
        } else {
          process.kill(-server.pid, 'SIGTERM')
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          throw error
        }
      }
    }
    mkdirSync(evidence, { recursive: true })
    writeFileSync(join(evidence, 'production-server.log'), serverOutput)
    for (const name of [
      'assessment.jsonl',
      'codemod-runs.jsonl',
      'invocations.jsonl',
      'provider.jsonl',
      'skill-runs.jsonl',
    ]) {
      if (existsSync(join(tools, name))) {
        writeFileSync(join(evidence, name), readFileSync(join(tools, name)))
      }
    }
  })

  test('serves every original UI route through App Router', () => {
    const routes = Object.values(
      JSON.parse(
        readFileSync(join(distDir, 'app-path-routes-manifest.json'), 'utf8')
      )
    )
    for (const route of ['/', '/blog', '/blog/[id]']) {
      expect(routes).toContain(route)
    }
    if (source === target) {
      expect(routes).toContain('/about')
    }
    const pages = JSON.parse(
      readFileSync(join(distDir, 'server/pages-manifest.json'), 'utf8')
    )
    expect(
      Object.keys(pages).filter(
        (route) =>
          !['/_app', '/_document', '/_error', '/404', '/500'].includes(route) &&
          route !== '/api' &&
          !route.startsWith('/api/')
      )
    ).toEqual([])
  })

  test('leaves Pages API source files unchanged', () => {
    const files = git(
      'ls-tree',
      '-r',
      '--name-only',
      baseline,
      '--',
      'pages/api'
    ).split('\n')
    expect(files.length).toBe(2)
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).toBe(
        execFileSync('git', ['show', `${baseline}:${file}`], {
          encoding: 'utf8',
        })
      )
    }
  })

  test('preserves API methods and response contracts', async () => {
    const list = await fetch(`${url}/api/posts`)
    expect(list.status).toBe(200)
    expect(await list.json()).toEqual([
      { id: 1, title: 'First Post', content: 'This is the first post' },
      { id: 2, title: 'Second Post', content: 'This is the second post' },
    ])
    const invalid = await fetch(`${url}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({
      error: 'Title and content are required',
    })
    const created = await fetch(`${url}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New post', content: 'New content' }),
    })
    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({
      title: 'New post',
      content: 'New content',
    })
    const post = await fetch(`${url}/api/posts/1`)
    expect(post.status).toBe(200)
    expect(await post.json()).toMatchObject({ id: 1, title: 'Post 1' })
    const updated = await fetch(`${url}/api/posts/1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({ id: 1, title: 'Updated' })
    const removed = await fetch(`${url}/api/posts/1`, { method: 'DELETE' })
    expect(removed.status).toBe(200)
    expect(await removed.json()).toEqual({
      message: 'Post 1 deleted successfully',
    })
    const unsupported = await fetch(`${url}/api/posts`, { method: 'PUT' })
    expect(unsupported.status).toBe(405)
    expect(unsupported.headers.get('allow')).toBe('GET, POST')
  })

  test('preserves request-specific data and browser navigation', async () => {
    for (const name of ['Alice', 'Bob']) {
      const context = await browser!.newContext({
        userAgent: `Future migration ${name}`,
      })
      try {
        const page = await context.newPage()
        await page.goto(url)
        await page
          .getByText(`Your user agent: Future migration ${name}`)
          .waitFor()
        expect(await page.title()).toBe('Home - My Blog')
        expect(await page.locator('header').innerText()).toContain('My Blog')
        expect(await page.locator('footer').innerText()).toContain('My Blog')
        await page.getByRole('button', { name: 'View All Posts' }).click()
        await page.waitForURL(`${url}/blog`)
        expect(await page.title()).toBe('Blog - My Blog')
        await page
          .getByRole('link', { name: 'First Post', exact: true })
          .click()
        await page.waitForURL(`${url}/blog/1`)
        expect(await page.title()).toBe('First Post - My Blog')
        await page.getByText('Comment on post 1', { exact: true }).waitFor()
        const missing = await page.goto(`${url}/blog/999`)
        expect([200, 404]).toContain(missing!.status())
        await page
          .getByText(/page.*(not.*found|doesn.t exist)/i)
          .first()
          .waitFor()
        if (source === target) {
          await page.goto(`${url}/about`)
          await page.getByRole('heading', { name: 'About My Blog' }).waitFor()
        }
      } finally {
        await context.close()
      }
    }
  }, 90_000)

  test('preserves rendering contracts and completes required adoption', async () => {
    await expect(environment).toSatisfyCriterion(
      `All original Pages UI routes are migrated to App Router, with shared styles and the theme provider preserved and obsolete Pages support files removed after transferring their behavior. Pages API routes remain in place. The home page user agent and timestamp remain request-time data beneath meaningful Suspense or loading UI; neither is put in a shared cache. The blog index retains its 60-second freshness and post pages retain 300-second freshness, using the target version's Cache Components APIs instead of incompatible route config. Unknown post IDs reach not-found UI. Cache Components and Partial Prefetching are fully adopted, with useful static shells and no temporary adoption opt-outs or TODOs. Judge behavior and target-version APIs rather than requiring one file organization, export syntax, or blanket absence of unrelated TODOs. If both flags were already enabled, migration still covers every remaining Pages UI route.`
    )
  })

  test('verifies migration stages in order', async () => {
    await expect(transcript).toSatisfyCriterion(
      source === target
        ? `This hybrid app starts on the target Next.js version with Cache Components and Partial Prefetching already enabled. The agent verified that existing state and preserved both flags while migrating all remaining Pages UI to App Router. It verified the migrated routes under those flags, including a passing production build, before reporting adoption complete. Disabling and re-enabling already-adopted flags is not required. Leaving Pages UI unmigrated or treating enabled flags alone as proof of completion does not satisfy this criterion.`
        : `The agent completed and verified the Next.js version upgrade before migrating Pages UI. It then migrated all Pages UI to App Router, preserved Pages API routes, and obtained a passing production build and verified the original UI routes before starting Cache Components adoption. It completed Cache Components adoption and obtained a passing production build with cacheComponents enabled before starting Partial Prefetching adoption, then audited prefetch behavior and completed that adoption. Enabling all flags together, skipping intermediate verification, or stopping after only one stage does not satisfy this criterion.`
    )
  })

  test('verifies the migrated app in production', async () => {
    await expect(transcript).toSatisfyCriterion(
      `After completing migration with cacheComponents and partialPrefetching enabled, the agent successfully built and started the production app and used a browser to navigate from the home page to the blog and a post. It observed the correct route content and request-specific user agent, and verified that the preserved Pages API endpoints still work. Successful production commands and observed browser-navigation results are required. Merely planning verification, fetching HTML, checking only next dev, or relying on checks run later by the grader does not satisfy this criterion.`
    )
  })

  test('does not publish the migration', () => {
    expect(
      execFileSync(
        'git',
        ['--git-dir', join(tools, 'origin.git'), 'rev-parse', 'main'],
        { encoding: 'utf8' }
      ).trim()
    ).toBe(baseline)
  })
}
