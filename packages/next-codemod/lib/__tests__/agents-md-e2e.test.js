/* global jest */
jest.autoMockOff()

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const { runAgentsMd } = require('../../bin/agents-md')
const { getNextjsVersion } = require('../../lib/agents-md')

function execNodeWithoutNodePath(script, options = {}) {
  // pnpm 12's Jest launcher exposes hoisted dependencies through NODE_PATH.
  // A fresh Node process must omit it to resolve only the fixture's dependencies.
  const env = { ...process.env, ...options.env }
  delete env.NODE_PATH
  return execFileSync(process.execPath, ['-e', script], {
    ...options,
    env,
    encoding: 'utf8',
  })
}

/**
 * TRUE E2E TESTS
 * These tests invoke the actual CLI entry point (runAgentsMd),
 * simulating what happens when a user runs:
 * npx @next/codemod agents-md --version 15.0.0 --output AGENTS.md
 */
describe('agents-md e2e (CLI invocation)', () => {
  let testProjectDir
  let originalConsoleLog
  let consoleOutput

  beforeEach(() => {
    // Create isolated test project directory
    const tmpBase = process.env.NEXT_TEST_DIR || os.tmpdir()
    testProjectDir = path.join(
      tmpBase,
      `agents-md-e2e-${Date.now()}-${(Math.random() * 1000) | 0}`
    )
    fs.mkdirSync(testProjectDir, { recursive: true })

    // Mock console.log to capture CLI output
    originalConsoleLog = console.log
    consoleOutput = []
    console.log = (...args) => {
      consoleOutput.push(args.join(' '))
    }
  })

  afterEach(() => {
    // Restore console.log
    console.log = originalConsoleLog

    // Clean up test directory
    if (testProjectDir && fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true })
    }
  })

  it('creates AGENTS.md and .next-docs directory when run with --version and --output', async () => {
    // Create a minimal package.json (not required, but realistic)
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        next: '15.0.0',
      },
    }
    fs.writeFileSync(
      path.join(testProjectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    )

    // Change to test directory
    const originalCwd = process.cwd()
    process.chdir(testProjectDir)

    try {
      // Run the actual CLI command
      await runAgentsMd({
        version: '15.0.0',
        output: 'AGENTS.md',
      })

      // Verify .next-docs directory was created and populated
      const docsDir = path.join(testProjectDir, '.next-docs')
      expect(fs.existsSync(docsDir)).toBe(true)

      const docFiles = fs.readdirSync(docsDir, { recursive: true })
      expect(docFiles.length).toBeGreaterThan(0)

      // Should contain mdx/md files
      const mdxFiles = docFiles.filter(
        (f) => f.endsWith('.mdx') || f.endsWith('.md')
      )
      expect(mdxFiles.length).toBeGreaterThan(0)

      // Verify AGENTS.md was created
      const agentsMdPath = path.join(testProjectDir, 'AGENTS.md')
      expect(fs.existsSync(agentsMdPath)).toBe(true)

      const agentsMdContent = fs.readFileSync(agentsMdPath, 'utf-8')

      // Verify content structure
      expect(agentsMdContent).toContain('<!-- NEXT-AGENTS-MD-START -->')
      expect(agentsMdContent).toContain('<!-- NEXT-AGENTS-MD-END -->')
      expect(agentsMdContent).toContain('[Next.js Docs Index]')
      expect(agentsMdContent).toContain('root: ./.next-docs')

      // Verify paths are normalized to forward slashes (cross-platform)
      const lines = agentsMdContent.split('|')
      const pathLines = lines.filter((line) => line.includes(':'))
      pathLines.forEach((line) => {
        // Should not contain Windows backslashes in the output
        const pathPart = line.split(':')[0]
        if (pathPart && pathPart.includes('/')) {
          expect(line).not.toMatch(/[^:]\\/)
        }
      })

      // Verify .gitignore was updated
      const gitignorePath = path.join(testProjectDir, '.gitignore')
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8')
        expect(gitignoreContent).toContain('.next-docs')
      }

      // Verify console output
      const output = consoleOutput.join('\n')
      expect(output).toContain('Downloading Next.js')
      expect(output).toContain('15.0.0')
      expect(output).toContain('AGENTS.md')
    } finally {
      // Restore original directory
      process.chdir(originalCwd)
    }
  })

  it('updates existing AGENTS.md without losing content', async () => {
    const originalCwd = process.cwd()
    process.chdir(testProjectDir)

    try {
      // Create existing AGENTS.md with custom content
      const existingContent = `# My Project

This is my project documentation.

## Features
- Feature 1
- Feature 2
`
      fs.writeFileSync(path.join(testProjectDir, 'AGENTS.md'), existingContent)

      // Run CLI
      await runAgentsMd({
        version: '15.0.0',
        output: 'AGENTS.md',
      })

      // Verify file was updated, not replaced
      const agentsMdContent = fs.readFileSync(
        path.join(testProjectDir, 'AGENTS.md'),
        'utf-8'
      )

      // Original content should still be there
      expect(agentsMdContent).toContain('# My Project')
      expect(agentsMdContent).toContain('This is my project documentation.')
      expect(agentsMdContent).toContain('## Features')

      // New index should be injected
      expect(agentsMdContent).toContain('<!-- NEXT-AGENTS-MD-START -->')
      expect(agentsMdContent).toContain('[Next.js Docs Index]')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('handles custom output filename', async () => {
    const originalCwd = process.cwd()
    process.chdir(testProjectDir)

    try {
      // Run with custom output file
      await runAgentsMd({
        version: '15.0.0',
        output: 'AGENTS.md',
      })

      // Verify AGENTS.md was created
      expect(fs.existsSync(path.join(testProjectDir, 'AGENTS.md'))).toBe(true)

      const agentsMdContent = fs.readFileSync(
        path.join(testProjectDir, 'AGENTS.md'),
        'utf-8'
      )
      expect(agentsMdContent).toContain('[Next.js Docs Index]')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('works when run from a subdirectory', async () => {
    const originalCwd = process.cwd()

    // Create a subdirectory
    const subDir = path.join(testProjectDir, 'packages', 'app')
    fs.mkdirSync(subDir, { recursive: true })

    // Create package.json in root
    const packageJson = {
      dependencies: { next: '15.0.0' },
    }
    fs.writeFileSync(
      path.join(testProjectDir, 'package.json'),
      JSON.stringify(packageJson)
    )

    // Change to subdirectory
    process.chdir(subDir)

    try {
      // Run from subdirectory - should create files in CWD (subdirectory)
      await runAgentsMd({
        version: '15.0.0',
        output: 'AGENTS.md',
      })

      // Verify files created in subdirectory
      expect(fs.existsSync(path.join(subDir, 'AGENTS.md'))).toBe(true)
      expect(fs.existsSync(path.join(subDir, '.next-docs'))).toBe(true)
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('normalizes paths on Windows (cross-platform test)', async () => {
    const originalCwd = process.cwd()
    process.chdir(testProjectDir)

    try {
      await runAgentsMd({
        version: '15.0.0',
        output: 'AGENTS.md',
      })

      const agentsMdContent = fs.readFileSync(
        path.join(testProjectDir, 'AGENTS.md'),
        'utf-8'
      )

      // Extract the index content between markers
      const startMarker = '<!-- NEXT-AGENTS-MD-START -->'
      const endMarker = '<!-- NEXT-AGENTS-MD-END -->'
      const startIdx = agentsMdContent.indexOf(startMarker) + startMarker.length
      const endIdx = agentsMdContent.indexOf(endMarker)
      const indexContent = agentsMdContent.slice(startIdx, endIdx)

      // Parse the index (format: "dir:{file1,file2}|dir2:{file3}")
      const sections = indexContent.split('|').filter((s) => s.includes(':'))

      sections.forEach((section) => {
        const [dirPath, filesStr] = section.split(':')
        if (dirPath && dirPath.trim() && !dirPath.includes('root')) {
          // Verify no Windows backslashes in directory paths
          expect(dirPath).not.toContain('\\')
          // Verify uses forward slashes
          if (dirPath.includes('/')) {
            expect(dirPath).toMatch(/^[^\\]+$/)
          }
        }
      })
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('handles version that requires git clone from GitHub', async () => {
    const originalCwd = process.cwd()
    process.chdir(testProjectDir)

    try {
      // Use a known stable version
      await runAgentsMd({
        version: '14.2.0',
        output: 'AGENTS.md',
      })

      // Verify docs were downloaded
      const docsDir = path.join(testProjectDir, '.next-docs')
      expect(fs.existsSync(docsDir)).toBe(true)

      const docFiles = fs.readdirSync(docsDir, { recursive: true })
      const mdxFiles = docFiles.filter(
        (f) => f.endsWith('.mdx') || f.endsWith('.md')
      )
      expect(mdxFiles.length).toBeGreaterThan(50) // Should have many doc files
    } finally {
      process.chdir(originalCwd)
    }
  }, 30000) // Increase timeout for git clone

  describe('bundled docs (Next.js >= 16.2.0)', () => {
    // Simulate an install of a Next.js version that ships docs inside the
    // published package at node_modules/next/dist/docs.
    function setupBundledNext(projectDir, version) {
      const nextDir = path.join(projectDir, 'node_modules', 'next')
      const gettingStartedDir = path.join(
        nextDir,
        'dist',
        'docs',
        '01-app',
        '01-getting-started'
      )
      fs.mkdirSync(gettingStartedDir, { recursive: true })
      fs.writeFileSync(
        path.join(nextDir, 'package.json'),
        JSON.stringify({ name: 'next', version })
      )
      fs.writeFileSync(
        path.join(nextDir, 'dist', 'docs', 'index.md'),
        '# Next.js Docs'
      )
      fs.writeFileSync(
        path.join(gettingStartedDir, '01-installation.md'),
        '# Installation'
      )
      fs.writeFileSync(
        path.join(gettingStartedDir, '02-project-structure.md'),
        '# Project Structure'
      )
    }

    it('indexes bundled docs instead of downloading when installed Next.js ships them', async () => {
      setupBundledNext(testProjectDir, '16.2.0')

      const originalCwd = process.cwd()
      process.chdir(testProjectDir)

      try {
        await runAgentsMd({ output: 'AGENTS.md' })

        // No .next-docs copy and no .gitignore entry for it
        expect(fs.existsSync(path.join(testProjectDir, '.next-docs'))).toBe(
          false
        )
        expect(fs.existsSync(path.join(testProjectDir, '.gitignore'))).toBe(
          false
        )

        const agentsMdContent = fs.readFileSync(
          path.join(testProjectDir, 'AGENTS.md'),
          'utf-8'
        )
        expect(agentsMdContent).toContain(
          'root: ./node_modules/next/dist/docs'
        )
        expect(agentsMdContent).toContain('01-installation.md')

        const output = consoleOutput.join('\n')
        expect(output).toContain('bundled with Next.js')
        expect(output).not.toContain('Downloading')
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('uses bundled docs when --version matches the installed version', async () => {
      setupBundledNext(testProjectDir, '16.2.0')

      const originalCwd = process.cwd()
      process.chdir(testProjectDir)

      try {
        await runAgentsMd({ version: '16.2.0', output: 'AGENTS.md' })

        expect(fs.existsSync(path.join(testProjectDir, '.next-docs'))).toBe(
          false
        )

        const agentsMdContent = fs.readFileSync(
          path.join(testProjectDir, 'AGENTS.md'),
          'utf-8'
        )
        expect(agentsMdContent).toContain(
          'root: ./node_modules/next/dist/docs'
        )
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('falls back to downloading when --version differs from the installed version', async () => {
      setupBundledNext(testProjectDir, '16.2.0')

      const originalCwd = process.cwd()
      process.chdir(testProjectDir)

      try {
        await runAgentsMd({ version: '15.0.0', output: 'AGENTS.md' })

        expect(fs.existsSync(path.join(testProjectDir, '.next-docs'))).toBe(
          true
        )

        const agentsMdContent = fs.readFileSync(
          path.join(testProjectDir, 'AGENTS.md'),
          'utf-8'
        )
        expect(agentsMdContent).toContain('root: ./.next-docs')

        const output = consoleOutput.join('\n')
        expect(output).toContain('Downloading')
      } finally {
        process.chdir(originalCwd)
      }
    }, 30000) // Increase timeout for git clone
  })

  // The index `root` is resolved by agents from the directory of the output
  // file, so it must be relative to that directory, not to the cwd.
  describe('paths relative to the output file', () => {
    const agentsMdLib = require('../../lib/agents-md')
    let originalCwd
    let pullDocsSpy

    // Install `next` the way pnpm's isolated linker does: the real package
    // lives in the root `node_modules/.pnpm` store and is only symlinked into
    // the package that depends on it.
    function installNextIsolated(projectDir, pkgDir, version) {
      const storeDir = path.join(
        projectDir,
        'node_modules',
        '.pnpm',
        `next@${version}`,
        'node_modules',
        'next'
      )
      writeBundledNextPackage(storeDir, version)
      const linkDir = path.join(pkgDir, 'node_modules')
      fs.mkdirSync(linkDir, { recursive: true })
      fs.symlinkSync(storeDir, path.join(linkDir, 'next'), 'junction')
    }

    function writeBundledNextPackage(nextDir, version) {
      const docsDir = path.join(nextDir, 'dist', 'docs', '01-app')
      fs.mkdirSync(docsDir, { recursive: true })
      fs.writeFileSync(
        path.join(nextDir, 'package.json'),
        JSON.stringify({ name: 'next', version })
      )
      fs.writeFileSync(path.join(docsDir, `docs-${version}.md`), '# Docs')
    }

    function readIndex(agentsMdPath) {
      const content = fs.readFileSync(agentsMdPath, 'utf-8')
      return {
        content,
        root: content.match(/\|root: ([^|]+)\|/)[1],
      }
    }

    // Returns the absolute path `root` points at, resolved the way an agent
    // reading the output file would resolve it.
    function resolveRoot(agentsMdPath) {
      return path.resolve(path.dirname(agentsMdPath), readIndex(agentsMdPath).root)
    }

    beforeEach(() => {
      originalCwd = process.cwd()
      // Stub the download so the `.next-docs` branch is testable offline.
      pullDocsSpy = jest
        .spyOn(agentsMdLib, 'pullDocs')
        .mockImplementation(async ({ docsDir }) => {
          const sectionDir = path.join(docsDir, '01-app')
          fs.mkdirSync(sectionDir, { recursive: true })
          fs.writeFileSync(path.join(sectionDir, 'downloaded.md'), '# Docs')
          return { success: true, docsPath: docsDir }
        })
    })

    afterEach(() => {
      process.chdir(originalCwd)
      pullDocsSpy.mockRestore()
    })

    it('links bundled docs relative to an output file outside the cwd', async () => {
      const appDir = path.join(testProjectDir, 'apps', 'web')
      installNextIsolated(testProjectDir, appDir, '16.4.0')
      process.chdir(appDir)

      await runAgentsMd({ output: '../../AGENTS.md' })

      const agentsMdPath = path.join(testProjectDir, 'AGENTS.md')
      expect(readIndex(agentsMdPath).root).toBe(
        './apps/web/node_modules/next/dist/docs'
      )
      expect(
        fs.existsSync(path.join(resolveRoot(agentsMdPath), '01-app'))
      ).toBe(true)
      expect(pullDocsSpy).not.toHaveBeenCalled()
    })

    it('links downloaded docs relative to an output file outside the cwd', async () => {
      const appDir = path.join(testProjectDir, 'apps', 'web')
      fs.mkdirSync(appDir, { recursive: true })
      process.chdir(appDir)

      await runAgentsMd({ version: '15.0.0', output: '../../AGENTS.md' })

      const agentsMdPath = path.join(testProjectDir, 'AGENTS.md')
      expect(readIndex(agentsMdPath).root).toBe('./apps/web/.next-docs')
      expect(fs.realpathSync(resolveRoot(agentsMdPath))).toBe(
        fs.realpathSync(path.join(appDir, '.next-docs'))
      )
    })

    it('keeps the ./ prefix for the .next-docs dot-directory', async () => {
      process.chdir(testProjectDir)

      await runAgentsMd({ version: '15.0.0', output: 'AGENTS.md' })

      expect(readIndex(path.join(testProjectDir, 'AGENTS.md')).root).toBe(
        './.next-docs'
      )
    })

    it('links the indexed install when the output dir resolves a different next', async () => {
      // Root has a hoisted next@16.3.0; the app has its own next@16.4.0.
      writeBundledNextPackage(
        path.join(testProjectDir, 'node_modules', 'next'),
        '16.3.0'
      )
      const appDir = path.join(testProjectDir, 'apps', 'web')
      installNextIsolated(testProjectDir, appDir, '16.4.0')
      process.chdir(appDir)

      await runAgentsMd({ output: '../../AGENTS.md' })

      const agentsMdPath = path.join(testProjectDir, 'AGENTS.md')
      const linkedPkg = JSON.parse(
        fs.readFileSync(
          path.join(resolveRoot(agentsMdPath), '..', '..', 'package.json'),
          'utf-8'
        )
      )
      expect(linkedPkg.version).toBe('16.4.0')
      expect(readIndex(agentsMdPath).content).toContain('docs-16.4.0.md')
    })

    it('writes a regeneration hint that is relative to the output file', async () => {
      const appDir = path.join(testProjectDir, 'apps', 'web')
      installNextIsolated(testProjectDir, appDir, '16.4.0')
      process.chdir(appDir)

      await runAgentsMd({ output: '../../AGENTS.md' })

      const { content } = readIndex(path.join(testProjectDir, 'AGENTS.md'))
      expect(content).toContain(
        "If docs missing, run this command from this file's directory: npx @next/codemod agents-md --output AGENTS.md|"
      )
      expect(content).not.toContain('--output ../../AGENTS.md')
    })

    it('supports an absolute --output path', async () => {
      const appDir = path.join(testProjectDir, 'apps', 'web')
      installNextIsolated(testProjectDir, appDir, '16.4.0')
      const outputDir = path.join(testProjectDir, 'docs-out')
      fs.mkdirSync(outputDir)
      const agentsMdPath = path.join(outputDir, 'CLAUDE.md')
      process.chdir(appDir)

      await runAgentsMd({ output: agentsMdPath })

      expect(fs.existsSync(agentsMdPath)).toBe(true)
      const { root, content } = readIndex(agentsMdPath)
      expect(root).toBe('../apps/web/node_modules/next/dist/docs')
      expect(
        fs.existsSync(path.join(resolveRoot(agentsMdPath), '01-app'))
      ).toBe(true)
      expect(content).toContain('--output CLAUDE.md|')
    })

    // The cwd/output path and the path `next` resolves to can be spelled
    // differently for the same directory: a symlinked alias, or an 8.3 short
    // name like `C:\Users\RUNNER~1\...` on Windows, where `process.cwd()`
    // keeps the short name while module resolution returns the long one.
    // Links must still be computed between consistent spellings.
    describe('when the cwd is spelled differently than the realpath', () => {
      let aliasBase
      let aliasDir
      let cwdSpy

      // Run from `dir` (inside the real project) while `process.cwd()`
      // reports it through the alias, like a non-canonical cwd on Windows.
      function chdirViaAlias(dir) {
        process.chdir(dir)
        const aliased = path.join(
          aliasDir,
          path.relative(fs.realpathSync(testProjectDir), fs.realpathSync(dir))
        )
        cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(aliased)
      }

      beforeEach(() => {
        aliasBase = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-alias-'))
        aliasDir = path.join(aliasBase, 'project')
        fs.symlinkSync(testProjectDir, aliasDir, 'junction')
      })

      afterEach(() => {
        cwdSpy?.mockRestore()
        cwdSpy = undefined
        fs.rmSync(aliasBase, { recursive: true, force: true })
      })

      it('links the conventional path through a symlinked cwd', async () => {
        writeBundledNextPackage(
          path.join(testProjectDir, 'node_modules', 'next'),
          '16.4.0'
        )
        chdirViaAlias(testProjectDir)

        await runAgentsMd({ output: 'AGENTS.md' })

        const agentsMdPath = path.join(testProjectDir, 'AGENTS.md')
        expect(readIndex(agentsMdPath).root).toBe(
          './node_modules/next/dist/docs'
        )
      })

      it('links a hoisted install canonically through a symlinked cwd', async () => {
        writeBundledNextPackage(
          path.join(testProjectDir, 'node_modules', 'next'),
          '16.4.0'
        )
        const appDir = path.join(testProjectDir, 'apps', 'web')
        fs.mkdirSync(appDir, { recursive: true })
        chdirViaAlias(appDir)

        await runAgentsMd({ output: 'AGENTS.md' })

        const agentsMdPath = path.join(testProjectDir, 'apps', 'web', 'AGENTS.md')
        expect(readIndex(agentsMdPath).root).toBe(
          '../../node_modules/next/dist/docs'
        )
        expect(
          fs.existsSync(path.join(resolveRoot(agentsMdPath), '01-app'))
        ).toBe(true)
      })

      it('detects the same install when only the native realpath canonicalizes', async () => {
        // Simulate Windows 8.3 short names: the JS `fs.realpathSync` leaves
        // the alias spelling as-is, while `fs.realpathSync.native` expands it.
        writeBundledNextPackage(
          path.join(testProjectDir, 'node_modules', 'next'),
          '16.4.0'
        )
        chdirViaAlias(testProjectDir)
        const nativeRealpath = fs.realpathSync.native
        const realpathSpy = jest
          .spyOn(fs, 'realpathSync')
          .mockImplementation((p) => path.resolve(String(p)))
        fs.realpathSync.native = nativeRealpath

        try {
          await runAgentsMd({ output: 'AGENTS.md' })
        } finally {
          realpathSpy.mockRestore()
        }

        expect(readIndex(path.join(testProjectDir, 'AGENTS.md')).root).toBe(
          './node_modules/next/dist/docs'
        )
      })
    })

    it('always prefixes relative links with ./ or ../', () => {
      const { getRelativeLinkPath } = agentsMdLib
      const base = path.join(testProjectDir, 'a', 'b')

      expect(getRelativeLinkPath(base, base)).toBe('./')
      expect(getRelativeLinkPath(base, path.join(testProjectDir, 'a'))).toBe(
        '../'
      )
      expect(getRelativeLinkPath(base, path.join(base, '.next-docs'))).toBe(
        './.next-docs'
      )
      expect(
        getRelativeLinkPath(base, path.join(testProjectDir, 'a', 'docs'))
      ).toBe('../docs')
      expect(getRelativeLinkPath(base, path.join(base, '..docs'))).toBe(
        './..docs'
      )
    })

    // In a pnpm monorepo `next` is usually not resolvable from the repo root,
    // so the bundled docs have to be found through the workspace packages.
    describe('bundled docs from workspace packages', () => {
      function setupWorkspace(patterns, packages) {
        fs.writeFileSync(
          path.join(testProjectDir, 'package.json'),
          JSON.stringify({ name: 'root', private: true })
        )
        fs.writeFileSync(
          path.join(testProjectDir, 'pnpm-workspace.yaml'),
          `packages:\n${patterns.map((p) => `  - '${p}'`).join('\n')}\n`
        )
        for (const [pkg, version] of Object.entries(packages)) {
          const pkgDir = path.join(testProjectDir, pkg)
          fs.mkdirSync(pkgDir, { recursive: true })
          fs.writeFileSync(
            path.join(pkgDir, 'package.json'),
            JSON.stringify({ name: path.basename(pkg) })
          )
          if (version) installNextIsolated(testProjectDir, pkgDir, version)
        }
      }

      function output() {
        // Package names are colored; strip ANSI so FORCE_COLOR doesn't matter.
        return require('strip-ansi')(consoleOutput.join('\n'))
      }

      function runFromWorkspaceRoot() {
        return require('strip-ansi')(
          execNodeWithoutNodePath(
            `const { runAgentsMd } = require(${JSON.stringify(
              path.join(__dirname, '../../bin/agents-md.js')
            )})
              runAgentsMd({ output: 'AGENTS.md' }).catch((error) => {
                console.error(error)
                process.exitCode = 1
              })`,
            { cwd: testProjectDir }
          )
        )
      }

      it('uses the bundled docs of a workspace package when run from the root', () => {
        setupWorkspace(['apps/*'], { 'apps/web': '16.4.0' })

        const cliOutput = runFromWorkspaceRoot()

        const agentsMdPath = path.join(testProjectDir, 'AGENTS.md')
        expect(readIndex(agentsMdPath).root).toBe(
          './apps/web/node_modules/next/dist/docs'
        )
        expect(
          fs.existsSync(path.join(resolveRoot(agentsMdPath), '01-app'))
        ).toBe(true)
        expect(fs.existsSync(path.join(testProjectDir, '.next-docs'))).toBe(
          false
        )
        expect(fs.existsSync(path.join(testProjectDir, '.gitignore'))).toBe(
          false
        )
        expect(cliOutput).toContain('workspace package apps/web')
      })

      it('indexes the package with the highest Next.js version', () => {
        setupWorkspace(['apps/a', 'apps/b'], {
          'apps/a': '16.3.0',
          'apps/b': '16.4.0',
        })

        const cliOutput = runFromWorkspaceRoot()

        const { root, content } = readIndex(
          path.join(testProjectDir, 'AGENTS.md')
        )
        expect(root).toBe('./apps/b/node_modules/next/dist/docs')
        expect(content).toContain('docs-16.4.0.md')
        expect(cliOutput).not.toContain('Downloading')
        expect(fs.existsSync(path.join(testProjectDir, '.next-docs'))).toBe(
          false
        )
      })

      it('picks the first matching package in workspace order and logs it', () => {
        // Listed b before a, so the choice follows the workspace patterns
        // rather than alphabetical order.
        setupWorkspace(['apps/b', 'apps/a'], {
          'apps/a': '16.4.0',
          'apps/b': '16.4.0',
        })

        const cliOutput = runFromWorkspaceRoot()

        expect(readIndex(path.join(testProjectDir, 'AGENTS.md')).root).toBe(
          './apps/b/node_modules/next/dist/docs'
        )
        expect(cliOutput).toContain('workspace package apps/b')
        expect(cliOutput).not.toContain('workspace package apps/a')
      })

      it('prefers a matching install resolved from the cwd', async () => {
        setupWorkspace(['apps/*'], { 'apps/web': '16.4.0' })
        writeBundledNextPackage(
          path.join(testProjectDir, 'node_modules', 'next'),
          '16.4.0'
        )
        process.chdir(testProjectDir)

        await runAgentsMd({ output: 'AGENTS.md' })

        expect(readIndex(path.join(testProjectDir, 'AGENTS.md')).root).toBe(
          './node_modules/next/dist/docs'
        )
        expect(output()).not.toContain('workspace package')
      })

      it('uses a workspace package matching --version when the cwd resolves another version', async () => {
        setupWorkspace(['apps/*'], { 'apps/web': '16.4.0' })
        writeBundledNextPackage(
          path.join(testProjectDir, 'node_modules', 'next'),
          '16.3.0'
        )
        process.chdir(testProjectDir)

        await runAgentsMd({ version: '16.4.0', output: 'AGENTS.md' })

        const { root, content } = readIndex(
          path.join(testProjectDir, 'AGENTS.md')
        )
        expect(root).toBe('./apps/web/node_modules/next/dist/docs')
        expect(content).toContain('docs-16.4.0.md')
        expect(pullDocsSpy).not.toHaveBeenCalled()
      })

      it('still downloads when no workspace package has matching bundled docs', async () => {
        setupWorkspace(['apps/*'], { 'apps/web': '16.4.0' })
        process.chdir(testProjectDir)

        await runAgentsMd({ version: '15.0.0', output: 'AGENTS.md' })

        expect(pullDocsSpy).toHaveBeenCalled()
        expect(readIndex(path.join(testProjectDir, 'AGENTS.md')).root).toBe(
          './.next-docs'
        )
        expect(output()).not.toContain('workspace package')
      })
    })
  })

  describe('getNextjsVersion', () => {
    const fixturesDir = path.join(__dirname, 'fixtures/agents-md')

    it('returns the installed Next.js version from node_modules', () => {
      const fixture = path.join(fixturesDir, 'next-specific-version')
      const result = getNextjsVersion(fixture)

      expect(result.version).toBe('15.4.0')
      expect(result.error).toBeUndefined()
    })

    it('returns actual installed version, not the tag from package.json', () => {
      // package.json has "next": "latest", but node_modules has version "16.0.0"
      const fixture = path.join(fixturesDir, 'next-tag')
      const result = getNextjsVersion(fixture)

      // Should return the actual installed version, not "latest"
      expect(result.version).toBe('16.0.0')
      expect(result.error).toBeUndefined()
    })

    it('returns error when Next.js is not installed', () => {
      const result = JSON.parse(
        execNodeWithoutNodePath(
          `const { getNextjsVersion } = require(${JSON.stringify(
            path.join(__dirname, '../agents-md.js')
          )})
          console.log(JSON.stringify(getNextjsVersion(process.cwd())))`,
          { cwd: testProjectDir }
        )
      )

      expect(result.version).toBeNull()
      expect(result.error).toBe('Next.js is not installed in this project.')
    })
  })
})
