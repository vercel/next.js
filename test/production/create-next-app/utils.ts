import execa from 'execa'
import { join } from 'path'
import { rm } from 'fs/promises'
import { spawn } from 'child_process'
import { fetchViaHTTP, findPort, killApp, waitFor } from 'next-test-utils'
import {
  resolveTestPkgPaths,
  serializeTestPkgPathsEnv,
} from './lib/test-pkg-paths'

export const CNA_PATH = require.resolve('create-next-app/dist/index.js')

/**
 * Resolves the path to the packed `next` tarball. Uses NEXT_TEST_PKG_PATHS
 * when available (set by run-tests.js), otherwise finds packed.tgz files
 * directly from the repo packages/ directory.
 */
export function resolveNextTgzFilename(): string {
  const pkgPaths = resolveTestPkgPaths()
  const tarballPath = pkgPaths?.get('next')

  if (!tarballPath) {
    throw new Error(
      `Could not find packed "next" tarball. ` +
        `Run "pnpm turbo run pack-for-isolated-tests" first, ` +
        `or run this test via "node run-tests.js".`
    )
  }

  return tarballPath
}
export const EXAMPLE_REPO = 'https://github.com/vercel/next.js/tree/canary'
export const EXAMPLE_PATH = 'examples/basic-css'
export const FULL_EXAMPLE_PATH = `${EXAMPLE_REPO}/${EXAMPLE_PATH}`
export const DEFAULT_FILES = [
  '.gitignore',
  'package.json',
  'app/page.tsx',
  'app/layout.tsx',
  'node_modules/next',
]

const isCanaryPublishRace = (output: string) =>
  // npm, pnpm, yarn, and bun wordings, respectively.
  /No matching version found|No candidates found|No version matching/.test(
    output
  ) && /@next\/|eslint-config-next/.test(output)

export const run = async (
  args: string[],
  nextJSVersion: string,
  options:
    | execa.Options
    | {
        reject?: boolean
        env?: Record<string, string>
      }
) => {
  // Tests with options.reject false are expected to exit(1) so stay silent.
  const expectFailure = options.reject === false

  for (let attempt = 1; ; attempt++) {
    const child = execa('node', [CNA_PATH].concat(args), {
      ...options,
      env: {
        ...process.env,
        // CNA detects the package manager from `npm_config_user_agent`. CI
        // runs jest directly (no `npm_config_user_agent` set) so CNA falls
        // back to npm. Locally the test runs under pnpm, which would make
        // CNA use pnpm and produce a `.pnpm`-based `node_modules/` that
        // doesn't survive being copied into the isolated test directory.
        // Clear the variable to mirror CI behavior across environments.
        npm_config_user_agent: undefined,
        // Forward all packed workspace tarballs so CNA can install siblings
        // (`next-rspack`, `eslint-config-next`, ...) from their own tarballs
        // when running tests directly (without `run-tests.js`).
        NEXT_TEST_PKG_PATHS: serializeTestPkgPathsEnv(),
        ...options.env,
        NEXT_PRIVATE_TEST_VERSION: nextJSVersion,
      },
    })
    if (!expectFailure) {
      // Streams are null for callers that pass their own `stdio`.
      child.stdout?.on('data', (chunk) => process.stdout.write(chunk))
      child.stderr?.on('data', (chunk) => process.stderr.write(chunk))
    }

    let failure: execa.ExecaError | null = null
    let result: execa.ExecaReturnValue
    try {
      result = await child
    } catch (err) {
      failure = err as execa.ExecaError
      result = failure
    }

    // Right after a canary release, `next@canary` can be resolvable from the
    // npm registry before the `@next/*` packages it depends on have finished
    // propagating, failing the install. Checked on success too because CNA
    // exits 0 when only the install step fails.
    if (
      attempt < 3 &&
      !expectFailure &&
      isCanaryPublishRace(result.all ?? '')
    ) {
      console.warn(
        'create-next-app install hit a canary publish race, retrying'
      )
      const cwd = (options as execa.Options).cwd
      if (cwd && args[0] && !args[0].startsWith('-')) {
        // CNA refuses to scaffold into the partially created project dir.
        await rm(join(cwd, args[0]), { recursive: true, force: true })
      }
      await waitFor(30_000)
      continue
    }

    if (failure) {
      throw failure
    }
    return result
  }
}

export const command = (cmd: string, args: string[]) =>
  execa(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env },
  })

export async function tryNextDev({
  cwd,
  projectName,
  isApp = true,
  isApi = false,
  isEmpty = false,
}: {
  cwd: string
  projectName: string
  isApp?: boolean
  isApi?: boolean
  isEmpty?: boolean
}) {
  // The caller wraps this in `useTempDir`, so `cwd` (and the CNA project
  // inside it) is already an isolated temp directory that gets removed
  // after the test. Running `next build`/`next start` directly inside it
  // is safe — `.next/` artifacts are cleaned up with the temp dir.
  const dir = join(cwd, projectName)

  // CNA installs `eslint-config-next` from the same `packed.tgz` path as
  // `next` (both come from `NEXT_PRIVATE_TEST_VERSION`), which causes npm to
  // unpack next's tarball into `node_modules/eslint-config-next` and to
  // create a `node_modules/.bin/next` shim pointing at that copy. Invoke
  // next's bin directly so webpack loaders resolve under `node_modules/next`.
  const nextBin = join(dir, 'node_modules/next/dist/bin/next')

  const buildResult = await execa('node', [nextBin, 'build'], {
    cwd: dir,
    stdio: 'inherit',
    env: { ...process.env },
    reject: false,
  })
  expect(buildResult.exitCode).toBe(0)

  const port = await findPort()
  const server = spawn(
    'node',
    [nextBin, 'start', '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: dir,
      env: { ...process.env, HOSTNAME: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  // Freshly installed CNA projects (with tailwind, eslint plugins, etc.)
  // can take well over the default 10s to boot `next start`, especially
  // under webpack where the built output is larger. Give them generous
  // headroom so these tests aren't flaky on loaded CI machines.
  const startServerTimeout = 60_000

  try {
    await new Promise<void>((resolve, reject) => {
      const onTimeout = setTimeout(() => {
        reject(
          new Error(
            `next start did not become ready within ${startServerTimeout}ms`
          )
        )
      }, startServerTimeout)

      const onReady = () => {
        clearTimeout(onTimeout)
        resolve()
      }

      const handleData = (chunk: Buffer) => {
        const msg = chunk.toString()
        process.stdout.write(msg)
        if (/- Local:|Ready in|✓ Ready/i.test(msg)) {
          onReady()
        }
      }

      server.stdout!.on('data', handleData)
      server.stderr!.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk.toString())
      })
      server.on('exit', (code) => {
        clearTimeout(onTimeout)
        reject(
          new Error(`next start exited before becoming ready (code=${code})`)
        )
      })
    })

    const res = await fetchViaHTTP(port, '/')
    if (isEmpty || isApi) {
      expect(await res.text()).toContain('Hello world!')
    } else {
      const responseText = await res.text()
      // The filename in the intro line is wrapped in a `<code>` element, so
      // strip HTML tags and collapse whitespace before matching the copy.
      const textContent = responseText
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
      const hasAppRouterText =
        textContent.includes('To get started, edit the page.tsx file.') ||
        textContent.includes('To get started, edit the page.js file.')
      const hasPagesRouterText =
        textContent.includes('To get started, edit the index.tsx file.') ||
        textContent.includes('To get started, edit the index.js file.')
      expect(hasAppRouterText || hasPagesRouterText).toBe(true)
    }
    expect(res.status).toBe(200)

    if (!isApp && !isEmpty) {
      const apiRes = await fetchViaHTTP(port, '/api/hello')
      expect(await apiRes.json()).toEqual({ name: 'John Doe' })
      expect(apiRes.status).toBe(200)
    }
  } finally {
    await killApp(server).catch(() => {})
  }
}

export {
  createNextApp,
  projectFilesShouldExist,
  projectFilesShouldNotExist,
  projectShouldHaveNoGitChanges,
  shouldBeTemplateProject,
  shouldBeJavascriptProject,
  shouldBeTypescriptProject,
} from './lib/utils'
export { useTempDir } from '../../lib/use-temp-dir'
