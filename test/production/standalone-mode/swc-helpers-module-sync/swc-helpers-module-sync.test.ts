import { ChildProcess, execFileSync } from 'child_process'
import { readdir } from 'fs/promises'
import { join } from 'path'
import fs from 'fs-extra'
import { nextTestSetup } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'

// Next's compiled output requires `@swc/helpers` subpaths (e.g.
// `@swc/helpers/_/_interop_require_default`) whose `exports` conditions list both an ESM and a
// CommonJS target. Which one `require()` picks depends on the running Node version: since Node 22.12
// `require()` supports ESM and therefore enables the `module-sync` condition, so the ESM target wins
// for `@swc/helpers` >= 0.5.23 (which lists `module-sync` first). If output file tracing records only
// the CommonJS target, `.next/standalone/server.js` exits with MODULE_NOT_FOUND before listening.
//
// Rather than hard-coding which of the two targets is correct (that depends on the Node version and
// on the order of conditions in the installed `@swc/helpers`), these tests ask Node itself what it
// resolves and require that exact file to be traced and copied.
const HELPER_FILE_RE =
  /^(.*[\\/]@swc[\\/]helpers)[\\/](?:cjs|esm)[\\/](.+?)\.(?:cjs|js)$/

/**
 * Resolves a subpath of the `@swc/helpers` copy in `packageDir` from inside that copy (a package
 * self-reference, which applies its `exports` conditions and stays within this copy), and returns
 * `null` if it doesn't resolve to an existing file.
 *
 * This runs in a child process on purpose: Jest's resolver intercepts `require.resolve` and applies
 * its own set of export conditions, so it would answer for the CommonJS target no matter what the
 * server's Node process actually picks.
 */
function resolveHelper(packageDir: string, subpath: string): string | null {
  const script =
    'const { createRequire } = require("module");' +
    'try { process.stdout.write(createRequire(process.argv[1]).resolve(process.argv[2])) }' +
    'catch { process.stdout.write("") }'
  const resolved = execFileSync(
    process.execPath,
    ['-e', script, join(packageDir, 'package.json'), subpath],
    { encoding: 'utf8' }
  )
  return resolved || null
}

async function listFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }
  return files
}

/**
 * Groups helper files by the `@swc/helpers` directory they belong to. An install can contain more
 * than one copy of the package, and each copy has to be complete on its own, because which copy a
 * file resolves to depends on where that file lives.
 */
function groupHelpersByPackageDir(files: string[]): Map<string, Set<string>> {
  const helpers = new Map<string, Set<string>>()
  for (const file of files) {
    const match = HELPER_FILE_RE.exec(file)
    if (match) {
      const [, packageDir, name] = match
      let names = helpers.get(packageDir)
      if (names == null) {
        helpers.set(packageDir, (names = new Set()))
      }
      names.add(name)
    }
  }
  return helpers
}

/**
 * For every helper a `@swc/helpers` directory contains, the file that `require()` resolves for its
 * public subpath - which is what Next's compiled output imports - has to exist as well. Returns a
 * description of every helper that fails this, so the assertion can report all of them at once.
 */
function missingResolvedHelpers(
  helpers: Map<string, Set<string>>,
  exists: (file: string) => boolean
): string[] {
  const missing: string[] = []
  for (const [packageDir, names] of helpers) {
    for (const name of names) {
      const subpath = `@swc/helpers/_/${name}`
      const resolved = resolveHelper(packageDir, subpath)
      if (resolved == null) {
        missing.push(`${subpath} does not resolve to a file in ${packageDir}`)
      } else if (!exists(resolved)) {
        missing.push(`${subpath} -> ${resolved}`)
      }
    }
  }
  return missing
}

describe('standalone mode - module-sync swc helpers', () => {
  let server: ChildProcess
  let appPort: number

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  beforeAll(async () => {
    const { exitCode } = await next.build()
    if (exitCode !== 0) {
      throw new Error(`next build failed with exit code ${exitCode}`)
    }
  })

  it('should trace the @swc/helpers targets that Node resolves', async () => {
    // `realpath` so these paths are comparable to the ones tracing and `require.resolve` report,
    // which have symlinks resolved.
    const testDir = await fs.realpath(next.testDir)
    const trace = await next.readJSON('.next/next-server.js.nft.json')
    // The traced paths are relative to the directory the manifest lives in.
    const tracedFiles: string[] = trace.files.map((file: string) =>
      join(testDir, '.next', file)
    )
    const tracedFileSet = new Set(tracedFiles)

    const helpers = groupHelpersByPackageDir(tracedFiles)
    // Guard against the assertion below silently passing because nothing was traced at all.
    expect(helpers.size).toBeGreaterThan(0)

    // Compare paths exactly: matching by file name (or by suffix) would also accept a file from a
    // *different* copy of `@swc/helpers`, which is not the file the server loads.
    expect(
      missingResolvedHelpers(helpers, (file) => tracedFileSet.has(file))
    ).toEqual([])
  })

  it('should copy the @swc/helpers targets that Node resolves into the standalone output', async () => {
    const standaloneDir = await fs.realpath(
      join(next.testDir, '.next/standalone')
    )
    const standaloneFiles = await listFiles(standaloneDir)

    const helpers = groupHelpersByPackageDir(standaloneFiles)
    // Guard against the assertion below silently passing because nothing was copied at all.
    expect(helpers.size).toBeGreaterThan(0)

    // Unlike the trace assertion above this resolves inside the standalone output itself, i.e. from
    // exactly the directory the copied server resolves the helpers from.
    expect(
      missingResolvedHelpers(helpers, (file) => fs.existsSync(file))
    ).toEqual([])
  })

  describe('when only the standalone output remains', () => {
    beforeAll(async () => {
      await fs.move(
        join(next.testDir, '.next/standalone'),
        join(next.testDir, 'standalone')
      )

      await fs.copy(
        join(next.testDir, '.next/static'),
        join(next.testDir, 'standalone/.next/static')
      )

      // Remove everything else (including node_modules) so that the server can only load what the
      // file traces brought into the standalone output.
      for (const file of await fs.readdir(next.testDir)) {
        if (file !== 'standalone') {
          await fs.remove(join(next.testDir, file))
        }
      }

      appPort = await findPort()
      server = await initNextServerScript(
        join(next.testDir, 'standalone/server.js'),
        /- Local:/,
        {
          ...process.env,
          ...next.env,
          PORT: '' + appPort,
        }
      )
    })

    afterAll(async () => {
      if (server) {
        await killApp(server)
      }
    })

    it('should start the server and render the page', async () => {
      const res = await fetchViaHTTP(appPort, '/')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('hello world')
    })
  })
})
