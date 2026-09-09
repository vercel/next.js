import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeAgentFiles } from 'next/dist/server/lib/generate-agent-files'

const AGENT_RULES_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'
const AGENT_RULES_END_MARKER = '<!-- END:nextjs-agent-rules -->'

/**
 * The canonical block as the version under test generates it,
 * obtained by running the real generator into a temp dir — the test
 * never hardcodes the wording.
 */
function currentAgentRulesBlock(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-'))
  writeAgentFiles(dir)
  return fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8').trimEnd()
}

function runAgentRulesWrite(content: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-write-'))
  const filePath = path.join(dir, 'AGENTS.md')
  fs.writeFileSync(filePath, content)

  try {
    const firstResult = writeAgentFiles(dir)
    const afterFirstWrite = fs.readFileSync(filePath, 'utf-8')
    const secondResult = writeAgentFiles(dir)
    const afterSecondWrite = fs.readFileSync(filePath, 'utf-8')
    return { firstResult, afterFirstWrite, secondResult, afterSecondWrite }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('agent-rules marker safety', () => {
  it.each([
    ['start marker only', `${AGENT_RULES_MARKER}\n# User rules\n`],
    ['end marker only', `# User rules\n${AGENT_RULES_END_MARKER}\n`],
    [
      'reversed markers',
      `${AGENT_RULES_END_MARKER}\n# User rules\n${AGENT_RULES_MARKER}\n`,
    ],
    [
      'nested start marker',
      `${AGENT_RULES_MARKER}\n# User rules\n${AGENT_RULES_MARKER}\n${AGENT_RULES_END_MARKER}\n`,
    ],
    [
      'duplicate blocks',
      `${AGENT_RULES_MARKER}\nfirst\n${AGENT_RULES_END_MARKER}\n${AGENT_RULES_MARKER}\nsecond\n${AGENT_RULES_END_MARKER}\n`,
    ],
    [
      'extra end marker',
      `${AGENT_RULES_MARKER}\n# User rules\n${AGENT_RULES_END_MARKER}\n${AGENT_RULES_END_MARKER}\n`,
    ],
  ])('does not modify a file with a malformed %s', (_name, content) => {
    const result = runAgentRulesWrite(content)

    expect(result.firstResult).toEqual({
      agentsMd: 'malformed',
      claudeMd: 'skipped',
    })
    expect(result.secondResult).toEqual(result.firstResult)
    expect(result.afterFirstWrite).toBe(content)
    expect(result.afterSecondWrite).toBe(content)
  })

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('updates one valid block idempotently with %s endings', (_name, eol) => {
    const content = [
      '# Team rules',
      '',
      AGENT_RULES_MARKER,
      'stale managed content',
      AGENT_RULES_END_MARKER,
      '',
      '# More team rules',
      '',
    ].join(eol)
    const result = runAgentRulesWrite(content)

    expect(result.firstResult).toEqual({
      agentsMd: 'updated',
      claudeMd: 'skipped',
    })
    expect(result.secondResult).toEqual({
      agentsMd: 'unchanged',
      claudeMd: 'skipped',
    })
    expect(result.afterSecondWrite).toBe(result.afterFirstWrite)
    expect(result.afterFirstWrite).toContain('# Team rules')
    expect(result.afterFirstWrite).toContain('# More team rules')
    expect(result.afterFirstWrite).not.toContain('stale managed content')
    expect(result.afterFirstWrite.split(AGENT_RULES_MARKER)).toHaveLength(2)
    if (eol === '\r\n') {
      expect(result.afterFirstWrite).not.toMatch(/(^|[^\r])\n/)
    }
  })
})

describe('agent-rules auto-generate on next dev (agent detected)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CLAUDECODE: '1' },
  })

  it('creates AGENTS.md and CLAUDE.md at the project root when neither exists', async () => {
    // A request is required to synchronize the test with the auto-gen
    // hook — `✓ Ready in X` is logged before the config load that runs
    // the hook, so `next.start()` resolves too early. `next.fetch` blocks
    // on the request handler, which only becomes ready after the hook.
    await next.fetch('/')

    const agentsContent = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(agentsContent).toContain(AGENT_RULES_MARKER)
    expect(agentsContent).toContain('node_modules/next/dist/docs/')

    const claudeContent = fs.readFileSync(
      path.join(next.testDir, 'CLAUDE.md'),
      'utf-8'
    )
    expect(claudeContent).toBe('@AGENTS.md\n')
  })
})

describe('agent-rules auto-generate on next dev (no agent)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // Explicitly clear every env var the agent detector inspects so the
    // test doesn't inherit one from the host shell (e.g. running it
    // inside Claude Code would otherwise trigger generation).
    env: {
      AI_AGENT: '',
      CURSOR_TRACE_ID: '',
      CURSOR_AGENT: '',
      GEMINI_CLI: '',
      CODEX_SANDBOX: '',
      CODEX_CI: '',
      CODEX_THREAD_ID: '',
      ANTIGRAVITY_AGENT: '',
      AUGMENT_AGENT: '',
      OPENCODE_CLIENT: '',
      CLAUDECODE: '',
      CLAUDE_CODE: '',
      REPL_ID: '',
      COPILOT_MODEL: '',
      COPILOT_ALLOW_ALL: '',
      COPILOT_GITHUB_TOKEN: '',
    },
  })

  it('does not create AGENTS.md or CLAUDE.md when no agent is detected', async () => {
    await next.fetch('/')
    expect(fs.existsSync(path.join(next.testDir, 'AGENTS.md'))).toBe(false)
    expect(fs.existsSync(path.join(next.testDir, 'CLAUDE.md'))).toBe(false)
  })
})

describe('agent-rules auto-generate on next dev (agentRules: false)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CLAUDECODE: '1' },
    nextConfig: {
      agentRules: false,
    },
  })

  it('does not generate files when agentRules is disabled in next.config', async () => {
    await next.fetch('/')
    expect(fs.existsSync(path.join(next.testDir, 'AGENTS.md'))).toBe(false)
    expect(fs.existsSync(path.join(next.testDir, 'CLAUDE.md'))).toBe(false)
  })
})

describe('agent-rules auto-generate on next dev (AGENTS.md has an outdated managed block)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CLAUDECODE: '1' },
    skipStart: true,
  })

  // A block written by a different Next.js version — the content
  // between the markers should be upgraded in place while everything
  // around it is preserved. Uses synthetic body text so this test does
  // not depend on any particular shipped wording.
  const OUTDATED_BLOCK = `${AGENT_RULES_MARKER}
# Stale heading from an older Next.js

Stale body from an older Next.js.
<!-- END:nextjs-agent-rules -->`

  beforeAll(async () => {
    await next.patchFile(
      'AGENTS.md',
      `# Team rules\n\nUse tabs, not spaces.\n\n${OUTDATED_BLOCK}\n`
    )
    await next.start()
  })

  it('refreshes the block in place and preserves surrounding content', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain('Use tabs, not spaces.')
    expect(content).not.toContain('Stale body from an older Next.js.')
    expect(content).toContain(currentAgentRulesBlock())
    // Exactly one managed block — upgraded, not duplicated.
    expect(content.split(AGENT_RULES_MARKER).length - 1).toBe(1)
    expect(fs.existsSync(path.join(next.testDir, 'CLAUDE.md'))).toBe(false)
  })

  it('is idempotent across dev server restarts', async () => {
    await next.fetch('/')
    const before = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    await next.stop()
    await next.start()
    await next.fetch('/')
    const after = fs.readFileSync(path.join(next.testDir, 'AGENTS.md'), 'utf-8')
    expect(after).toBe(before)
  })
})

describe('agent-rules auto-generate on next dev (AGENTS.md has malformed markers)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CLAUDECODE: '1' },
    skipStart: true,
  })
  const originalContent = `${AGENT_RULES_MARKER}\n# User-authored rules without an end marker\n`

  beforeAll(async () => {
    await next.patchFile('AGENTS.md', originalContent)
    await next.start()
  })

  it('preserves the file and reports how to recover across restarts', async () => {
    await next.fetch('/')
    const filePath = path.join(next.testDir, 'AGENTS.md')

    expect(fs.readFileSync(filePath, 'utf-8')).toBe(originalContent)
    expect(next.cliOutput).toContain(
      'Skipped updating AGENTS.md because its Next.js agent-rules markers are malformed.'
    )
    expect(next.cliOutput).toContain('agentRules: false')

    await next.stop()
    await next.start()
    await next.fetch('/')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(originalContent)
  })
})

describe('agent-rules auto-generate on next dev (AGENTS.md exists without marker)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CLAUDECODE: '1' },
    skipStart: true,
  })

  beforeAll(async () => {
    // User-authored AGENTS.md without the managed marker — auto-gen
    // should upsert the block while preserving existing content.
    await next.patchFile('AGENTS.md', '# Team rules\n\nUse tabs, not spaces.\n')
    await next.start()
  })

  it('upserts the managed block and preserves existing content', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain('Use tabs, not spaces.')
    expect(content).toContain(AGENT_RULES_MARKER)
    // CLAUDE.md must stay alone when AGENTS.md already exists.
    expect(fs.existsSync(path.join(next.testDir, 'CLAUDE.md'))).toBe(false)
  })
})

describe('agent-rules auto-generate on next dev (CLAUDE.md exists, no AGENTS.md)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CLAUDECODE: '1' },
    skipStart: true,
  })

  beforeAll(async () => {
    await next.patchFile('CLAUDE.md', '# My rules\n\nBe concise.\n')
    await next.start()
  })

  it('upserts into CLAUDE.md and does not create AGENTS.md', async () => {
    await next.fetch('/')
    const claudeContent = fs.readFileSync(
      path.join(next.testDir, 'CLAUDE.md'),
      'utf-8'
    )
    expect(claudeContent).toContain('Be concise.')
    expect(claudeContent).toContain(AGENT_RULES_MARKER)
    expect(fs.existsSync(path.join(next.testDir, 'AGENTS.md'))).toBe(false)
  })
})
