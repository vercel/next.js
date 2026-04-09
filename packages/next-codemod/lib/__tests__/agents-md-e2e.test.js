/* global jest */
jest.autoMockOff()

const fs = require('fs')
const path = require('path')
const os = require('os')
const { runAgentsMd } = require('../../bin/agents-md')
const { runUpgradeAgentsMd } = require('../../bin/upgrade-agents-md')
const {
  getNextjsVersion,
  requireNextProjectDir,
  hasBundledDocs,
  AGENT_RULES_START_MARKER,
  AGENT_RULES_END_MARKER,
} = require('../../lib/agents-md')

const BUNDLED_FIXTURE_DIR = path.join(
  __dirname,
  'fixtures/agents-md/next-bundled-docs'
)
const MONOREPO_FIXTURE_DIR = path.join(
  __dirname,
  'fixtures/agents-md/next-monorepo-bundled'
)

/**
 * Recursively copy the bundled-docs fixture into `dest` so tests can mutate
 * it without touching the checked-in tree.
 */
function copyFixture(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyFixture(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * TRUE E2E TESTS
 * These tests invoke the actual CLI entry point (runAgentsMd),
 * simulating what happens when a user runs:
 * npx @next/codemod agents-md --version 15.0.0 --output CLAUDE.md
 */
describe('agents-md e2e (CLI invocation)', () => {
  let testProjectDir
  let originalConsoleLog
  let consoleOutput

  beforeEach(() => {
    // Create an isolated test project dir via `mkdtempSync` so parallel
    // workers can't collide on the same path.
    const tmpBase = process.env.NEXT_TEST_DIR || os.tmpdir()
    testProjectDir = fs.mkdtempSync(path.join(tmpBase, 'agents-md-e2e-'))

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

  it('creates CLAUDE.md and .next-docs directory when run with --version and --output', async () => {
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
        output: 'CLAUDE.md',
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

      // Verify CLAUDE.md was created
      const claudeMdPath = path.join(testProjectDir, 'CLAUDE.md')
      expect(fs.existsSync(claudeMdPath)).toBe(true)

      const claudeMdContent = fs.readFileSync(claudeMdPath, 'utf-8')

      // Verify content structure
      expect(claudeMdContent).toContain('<!-- NEXT-AGENTS-MD-START -->')
      expect(claudeMdContent).toContain('<!-- NEXT-AGENTS-MD-END -->')
      expect(claudeMdContent).toContain('[Next.js Docs Index]')
      expect(claudeMdContent).toContain('root: ./.next-docs')

      // Verify paths are normalized to forward slashes (cross-platform)
      const lines = claudeMdContent.split('|')
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
      expect(output).toContain('CLAUDE.md')
    } finally {
      // Restore original directory
      process.chdir(originalCwd)
    }
  })

  it('updates existing CLAUDE.md without losing content', async () => {
    const originalCwd = process.cwd()
    process.chdir(testProjectDir)

    try {
      // Create existing CLAUDE.md with custom content
      const existingContent = `# My Project

This is my project documentation.

## Features
- Feature 1
- Feature 2
`
      fs.writeFileSync(
        path.join(testProjectDir, 'CLAUDE.md'),
        existingContent
      )

      // Run CLI
      await runAgentsMd({
        version: '15.0.0',
        output: 'CLAUDE.md',
      })

      // Verify file was updated, not replaced
      const claudeMdContent = fs.readFileSync(
        path.join(testProjectDir, 'CLAUDE.md'),
        'utf-8'
      )

      // Original content should still be there
      expect(claudeMdContent).toContain('# My Project')
      expect(claudeMdContent).toContain('This is my project documentation.')
      expect(claudeMdContent).toContain('## Features')

      // New index should be injected
      expect(claudeMdContent).toContain('<!-- NEXT-AGENTS-MD-START -->')
      expect(claudeMdContent).toContain('[Next.js Docs Index]')
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

      // Verify AGENTS.md was created (not CLAUDE.md)
      expect(fs.existsSync(path.join(testProjectDir, 'AGENTS.md'))).toBe(true)
      expect(fs.existsSync(path.join(testProjectDir, 'CLAUDE.md'))).toBe(false)

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
        output: 'CLAUDE.md',
      })

      // Verify files created in subdirectory
      expect(fs.existsSync(path.join(subDir, 'CLAUDE.md'))).toBe(true)
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
        output: 'CLAUDE.md',
      })

      const claudeMdContent = fs.readFileSync(
        path.join(testProjectDir, 'CLAUDE.md'),
        'utf-8'
      )

      // Extract the index content between markers
      const startMarker = '<!-- NEXT-AGENTS-MD-START -->'
      const endMarker = '<!-- NEXT-AGENTS-MD-END -->'
      const startIdx = claudeMdContent.indexOf(startMarker) + startMarker.length
      const endIdx = claudeMdContent.indexOf(endMarker)
      const indexContent = claudeMdContent.slice(startIdx, endIdx)

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
        output: 'CLAUDE.md',
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

  describe('upgrade-agents-md (bundled docs fast path)', () => {
    let fixtureProjectDir

    beforeEach(() => {
      const tmpBase = process.env.NEXT_TEST_DIR || os.tmpdir()
      fixtureProjectDir = fs.mkdtempSync(
        path.join(tmpBase, 'agents-md-bundled-')
      )
      copyFixture(BUNDLED_FIXTURE_DIR, fixtureProjectDir)
    })

    afterEach(() => {
      if (fixtureProjectDir && fs.existsSync(fixtureProjectDir)) {
        fs.rmSync(fixtureProjectDir, { recursive: true, force: true })
      }
    })

    it('requireNextProjectDir + hasBundledDocs correctly gate the fast path', () => {
      // Flat layout: project dir is the fixture root itself; bundled
      // docs are detected because `node_modules/next/dist/docs` exists.
      expect(requireNextProjectDir(fixtureProjectDir)).toBe(fixtureProjectDir)
      expect(hasBundledDocs(fixtureProjectDir)).toBe(true)

      // A project with no `next` installed at all throws — strict cwd
      // check, same contract as `codemod upgrade`.
      const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-bare-'))
      try {
        expect(() => requireNextProjectDir(bareDir)).toThrow(
          /No package\.json found|Failed to resolve next/
        )
      } finally {
        fs.rmSync(bareDir, { recursive: true, force: true })
      }

      // A project with `next` declared in package.json but no
      // `dist/docs/` (e.g. 15.x) resolves the project dir but
      // hasBundledDocs returns false — upgrade-agents-md refuses to
      // proceed on that install.
      const legacyFixture = path.join(
        __dirname,
        'fixtures/agents-md/next-specific-version'
      )
      expect(requireNextProjectDir(legacyFixture)).toBe(legacyFixture)
      expect(hasBundledDocs(legacyFixture)).toBe(false)
    })

    it('aborts with a clear error when run outside any Next.js project', async () => {
      // No `package.json` at cwd — running the bundled-docs command
      // here would have nothing to install rules *for*. The strict
      // cwd check must abort with an actionable message instead of
      // silently falling through.
      const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-bare-'))
      const originalCwd = process.cwd()
      process.chdir(bareDir)
      try {
        await expect(runUpgradeAgentsMd()).rejects.toThrow(
          /No package\.json found|Failed to resolve next/
        )
      } finally {
        process.chdir(originalCwd)
        fs.rmSync(bareDir, { recursive: true, force: true })
      }
    })

    it('aborts when the installed Next.js has no bundled docs', async () => {
      // A real Next.js project but on an older version that predates
      // bundled docs. `upgrade-agents-md` must refuse and point the
      // user at the legacy `agents-md` command instead of silently
      // no-op'ing.
      const legacyFixture = path.join(
        __dirname,
        'fixtures/agents-md/next-specific-version'
      )
      const originalCwd = process.cwd()
      process.chdir(legacyFixture)
      try {
        await expect(runUpgradeAgentsMd()).rejects.toThrow(
          /does not ship bundled docs/
        )
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('writes AGENTS.md + CLAUDE.md and skips .next-docs when bundled docs exist', async () => {
      const originalCwd = process.cwd()
      process.chdir(fixtureProjectDir)

      try {
        await runUpgradeAgentsMd()

        const agentsMdPath = path.join(fixtureProjectDir, 'AGENTS.md')
        const claudeMdPath = path.join(fixtureProjectDir, 'CLAUDE.md')
        const dotNextDocsPath = path.join(fixtureProjectDir, '.next-docs')

        expect(fs.existsSync(agentsMdPath)).toBe(true)
        expect(fs.existsSync(claudeMdPath)).toBe(true)
        // Crucially: no git clone, no .next-docs/ directory created.
        expect(fs.existsSync(dotNextDocsPath)).toBe(false)

        const agentsMdContent = fs.readFileSync(agentsMdPath, 'utf-8')
        expect(agentsMdContent).toContain(AGENT_RULES_START_MARKER)
        expect(agentsMdContent).toContain(AGENT_RULES_END_MARKER)
        expect(agentsMdContent).toContain('node_modules/next/dist/docs/')

        const claudeMdContent = fs.readFileSync(claudeMdPath, 'utf-8')
        expect(claudeMdContent.trim()).toBe('@AGENTS.md')

        const output = consoleOutput.join('\n')
        expect(output).toContain('AGENTS.md')
        expect(output).toContain('CLAUDE.md')
        expect(output).not.toContain('Downloading Next.js')
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('is idempotent: re-running leaves files unchanged', async () => {
      const originalCwd = process.cwd()
      process.chdir(fixtureProjectDir)

      try {
        await runUpgradeAgentsMd()

        const agentsMdPath = path.join(fixtureProjectDir, 'AGENTS.md')
        const claudeMdPath = path.join(fixtureProjectDir, 'CLAUDE.md')
        const firstAgents = fs.readFileSync(agentsMdPath, 'utf-8')
        const firstClaude = fs.readFileSync(claudeMdPath, 'utf-8')

        await runUpgradeAgentsMd()

        expect(fs.readFileSync(agentsMdPath, 'utf-8')).toBe(firstAgents)
        expect(fs.readFileSync(claudeMdPath, 'utf-8')).toBe(firstClaude)
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('preserves existing AGENTS.md content and injects the marker block', async () => {
      const originalCwd = process.cwd()
      process.chdir(fixtureProjectDir)

      const existingAgents = `# My Project

Custom team instructions.

- Use tabs, not spaces.
`
      fs.writeFileSync(
        path.join(fixtureProjectDir, 'AGENTS.md'),
        existingAgents
      )

      try {
        await runUpgradeAgentsMd()

        const agentsMdContent = fs.readFileSync(
          path.join(fixtureProjectDir, 'AGENTS.md'),
          'utf-8'
        )

        // Custom content preserved.
        expect(agentsMdContent).toContain('# My Project')
        expect(agentsMdContent).toContain('Custom team instructions.')
        expect(agentsMdContent).toContain('Use tabs, not spaces.')

        // Marker block appended.
        expect(agentsMdContent).toContain(AGENT_RULES_START_MARKER)
        expect(agentsMdContent).toContain(AGENT_RULES_END_MARKER)
        expect(agentsMdContent).toContain('node_modules/next/dist/docs/')
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('strips the legacy NEXT-AGENTS-MD block when upserting the new block', async () => {
      const originalCwd = process.cwd()
      process.chdir(fixtureProjectDir)

      // Simulate a project that ran the pre-bundled-docs `agents-md` codemod.
      // Its `CLAUDE.md` wraps a `.next-docs/`-style doc index in the legacy
      // markers, with user content around it. `upgrade-agents-md` must strip
      // the stale legacy block so the file ends up with one source of truth.
      const existingClaude = `# My Project

Custom rules above.

<!-- NEXT-AGENTS-MD-START -->[Next.js Docs Index]|root: ./.next-docs|stale doc index here<!-- NEXT-AGENTS-MD-END -->

Custom rules below.
`
      fs.writeFileSync(
        path.join(fixtureProjectDir, 'CLAUDE.md'),
        existingClaude
      )

      try {
        await runUpgradeAgentsMd()

        const claudeMdContent = fs.readFileSync(
          path.join(fixtureProjectDir, 'CLAUDE.md'),
          'utf-8'
        )

        // User content above and below is preserved.
        expect(claudeMdContent).toContain('# My Project')
        expect(claudeMdContent).toContain('Custom rules above.')
        expect(claudeMdContent).toContain('Custom rules below.')

        // The new managed block is installed.
        expect(claudeMdContent).toContain(AGENT_RULES_START_MARKER)
        expect(claudeMdContent).toContain(AGENT_RULES_END_MARKER)
        expect(claudeMdContent).toContain('node_modules/next/dist/docs/')

        // The legacy block is gone — both markers and the stale doc index
        // payload between them.
        expect(claudeMdContent).not.toContain('<!-- NEXT-AGENTS-MD-START -->')
        expect(claudeMdContent).not.toContain('<!-- NEXT-AGENTS-MD-END -->')
        expect(claudeMdContent).not.toContain('[Next.js Docs Index]')
        expect(claudeMdContent).not.toContain('./.next-docs')
        expect(claudeMdContent).not.toContain('stale doc index here')
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('strips multiple legacy NEXT-AGENTS-MD blocks when several coexist', async () => {
      // Defensive: if a file somehow acquired two legacy blocks (e.g.
      // a manual paste or an interrupted earlier run), both should be
      // stripped in a single pass. Surrounding user content is
      // preserved.
      const originalCwd = process.cwd()
      process.chdir(fixtureProjectDir)

      const existingClaude = `# My Project

Top section.

<!-- NEXT-AGENTS-MD-START -->first stale payload<!-- NEXT-AGENTS-MD-END -->

Middle section.

<!-- NEXT-AGENTS-MD-START -->second stale payload<!-- NEXT-AGENTS-MD-END -->

Bottom section.
`
      fs.writeFileSync(
        path.join(fixtureProjectDir, 'CLAUDE.md'),
        existingClaude
      )

      try {
        await runUpgradeAgentsMd()

        const claudeMdContent = fs.readFileSync(
          path.join(fixtureProjectDir, 'CLAUDE.md'),
          'utf-8'
        )

        // All user sections preserved.
        expect(claudeMdContent).toContain('# My Project')
        expect(claudeMdContent).toContain('Top section.')
        expect(claudeMdContent).toContain('Middle section.')
        expect(claudeMdContent).toContain('Bottom section.')

        // Neither legacy payload survives.
        expect(claudeMdContent).not.toContain('<!-- NEXT-AGENTS-MD-START -->')
        expect(claudeMdContent).not.toContain('<!-- NEXT-AGENTS-MD-END -->')
        expect(claudeMdContent).not.toContain('first stale payload')
        expect(claudeMdContent).not.toContain('second stale payload')

        // Exactly one canonical block.
        const matches = claudeMdContent.match(
          new RegExp(AGENT_RULES_START_MARKER, 'g')
        )
        expect(matches).toHaveLength(1)
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('preserves CRLF line endings when upserting into a Windows-style file', async () => {
      // On Windows, existing `AGENTS.md` / `CLAUDE.md` files commonly
      // use CRLF. If the upsert stomps `\n` into a CRLF file, the
      // result ends up with mixed EOLs that confuse editors, diffs,
      // and `.gitattributes` normalization. The upsert must detect
      // the existing EOL style and match it.
      const originalCwd = process.cwd()
      process.chdir(fixtureProjectDir)

      const existingAgents =
        '# My Project\r\n\r\nCustom team instructions.\r\n\r\n- Use tabs.\r\n'
      fs.writeFileSync(
        path.join(fixtureProjectDir, 'AGENTS.md'),
        existingAgents
      )

      try {
        await runUpgradeAgentsMd()

        const agentsMdContent = fs.readFileSync(
          path.join(fixtureProjectDir, 'AGENTS.md'),
          'utf-8'
        )

        // User content preserved verbatim, CRLF and all.
        expect(agentsMdContent).toContain('# My Project\r\n')
        expect(agentsMdContent).toContain('Custom team instructions.\r\n')

        // Canonical block landed.
        expect(agentsMdContent).toContain(AGENT_RULES_START_MARKER)
        expect(agentsMdContent).toContain('node_modules/next/dist/docs/')

        // No lone LFs introduced: every `\n` must be preceded by `\r`.
        // `match(/(?<!\r)\n/g)` would catch any LF that isn't part of a
        // CRLF pair.
        expect(agentsMdContent.match(/(?<!\r)\n/g)).toBeNull()
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('replaces the agent-rules block in place when the marker is already present', async () => {
      const originalCwd = process.cwd()
      process.chdir(fixtureProjectDir)

      const existingAgents = `# My Project

${AGENT_RULES_START_MARKER}
# Old stale instructions
${AGENT_RULES_END_MARKER}

Footer content.
`
      fs.writeFileSync(
        path.join(fixtureProjectDir, 'AGENTS.md'),
        existingAgents
      )

      try {
        await runUpgradeAgentsMd()

        const agentsMdContent = fs.readFileSync(
          path.join(fixtureProjectDir, 'AGENTS.md'),
          'utf-8'
        )

        expect(agentsMdContent).toContain('# My Project')
        expect(agentsMdContent).toContain('Footer content.')
        expect(agentsMdContent).not.toContain('Old stale instructions')
        expect(agentsMdContent).toContain('node_modules/next/dist/docs/')
        // Exactly one BEGIN marker.
        const matches = agentsMdContent.match(
          new RegExp(AGENT_RULES_START_MARKER, 'g')
        )
        expect(matches).toHaveLength(1)
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('upserts the block into CLAUDE.md when it exists and AGENTS.md does not', async () => {
      const originalCwd = process.cwd()
      process.chdir(fixtureProjectDir)

      const existingClaude = '# Team CLAUDE.md\n\nCustom rules.\n'
      fs.writeFileSync(
        path.join(fixtureProjectDir, 'CLAUDE.md'),
        existingClaude
      )

      try {
        await runUpgradeAgentsMd()

        const claudeMdContent = fs.readFileSync(
          path.join(fixtureProjectDir, 'CLAUDE.md'),
          'utf-8'
        )

        // Original content preserved, rules block appended.
        expect(claudeMdContent).toContain('# Team CLAUDE.md')
        expect(claudeMdContent).toContain('Custom rules.')
        expect(claudeMdContent).toContain(AGENT_RULES_START_MARKER)
        expect(claudeMdContent).toContain('node_modules/next/dist/docs/')

        // AGENTS.md is NOT created — the user chose CLAUDE.md as their file.
        expect(
          fs.existsSync(path.join(fixtureProjectDir, 'AGENTS.md'))
        ).toBe(false)
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('leaves CLAUDE.md untouched when AGENTS.md exists (prefers AGENTS.md)', async () => {
      const originalCwd = process.cwd()
      process.chdir(fixtureProjectDir)

      const existingClaude = '# Team CLAUDE.md\n\nCustom rules.\n'
      fs.writeFileSync(
        path.join(fixtureProjectDir, 'AGENTS.md'),
        '# Existing AGENTS.md\n'
      )
      fs.writeFileSync(
        path.join(fixtureProjectDir, 'CLAUDE.md'),
        existingClaude
      )

      try {
        await runUpgradeAgentsMd()

        const agentsMdContent = fs.readFileSync(
          path.join(fixtureProjectDir, 'AGENTS.md'),
          'utf-8'
        )
        const claudeMdContent = fs.readFileSync(
          path.join(fixtureProjectDir, 'CLAUDE.md'),
          'utf-8'
        )

        // AGENTS.md got the block; CLAUDE.md is byte-identical.
        expect(agentsMdContent).toContain(AGENT_RULES_START_MARKER)
        expect(claudeMdContent).toBe(existingClaude)
      } finally {
        process.chdir(originalCwd)
      }
    })
  })

  describe('upgrade-agents-md (monorepo)', () => {
    let monorepoProjectDir

    beforeEach(() => {
      const tmpBase = process.env.NEXT_TEST_DIR || os.tmpdir()
      monorepoProjectDir = fs.mkdtempSync(
        path.join(tmpBase, 'agents-md-monorepo-')
      )
      copyFixture(MONOREPO_FIXTURE_DIR, monorepoProjectDir)
    })

    afterEach(() => {
      if (monorepoProjectDir && fs.existsSync(monorepoProjectDir)) {
        fs.rmSync(monorepoProjectDir, { recursive: true, force: true })
      }
    })

    it('refuses to run from the monorepo root (strict cwd check)', async () => {
      // In the monorepo fixture, `next` is declared in
      // `apps/web/package.json`, NOT in the monorepo root's
      // `package.json`. `upgrade-agents-md` anchors strictly on
      // `cwd` — same contract as `codemod upgrade` — so invoking it
      // from the monorepo root must abort with an actionable
      // message instead of walking up or silently targeting the
      // wrong directory.
      const originalCwd = process.cwd()
      process.chdir(monorepoProjectDir)
      try {
        await expect(runUpgradeAgentsMd()).rejects.toThrow(
          /Failed to resolve next/
        )
      } finally {
        process.chdir(originalCwd)
      }
    })

    it('writes AGENTS.md into the sub-package when invoked from there', async () => {
      const subPackageDir = path.join(monorepoProjectDir, 'apps', 'web')
      const originalCwd = process.cwd()
      process.chdir(subPackageDir)

      try {
        await runUpgradeAgentsMd()

        // AGENTS.md must land at the sub-package, NOT at the monorepo
        // root. Agents locate agent-rules files at the package level
        // they're working in, so `apps/web/AGENTS.md` is the only
        // location they'll actually read.
        const rootAgentsPath = path.join(monorepoProjectDir, 'AGENTS.md')
        const subPackageAgentsPath = path.join(subPackageDir, 'AGENTS.md')
        expect(fs.existsSync(rootAgentsPath)).toBe(false)
        expect(fs.existsSync(subPackageAgentsPath)).toBe(true)

        const agentsMdContent = fs.readFileSync(
          subPackageAgentsPath,
          'utf-8'
        )
        // Because AGENTS.md is co-located with the sub-package's own
        // `node_modules/next/`, the block references the plain
        // `node_modules/next/dist/docs/` path — same string we'd
        // write for a flat project. No monorepo-relative paths.
        expect(agentsMdContent).toContain(AGENT_RULES_START_MARKER)
        expect(agentsMdContent).toContain('`node_modules/next/dist/docs/`')
        expect(agentsMdContent).not.toContain(
          'apps/web/node_modules/next/dist/docs/'
        )
      } finally {
        process.chdir(originalCwd)
      }
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
      // Use a directory where next is not installed
      const nonNextDir = '/tmp'
      const result = getNextjsVersion(nonNextDir)

      expect(result.version).toBeNull()
      expect(result.error).toBe('Next.js is not installed in this project.')
    })
  })
})
