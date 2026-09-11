import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeAgentFiles } from 'next/dist/server/lib/generate-agent-files'

const AGENT_RULES_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'
const AGENT_FEEDBACK_MARKER = '<!-- BEGIN:nextjs-agent-feedback -->'

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

function currentAgentFeedbackBlock(): string {
  return `${AGENT_FEEDBACK_MARKER}
stale feedback instructions
<!-- END:nextjs-agent-feedback -->`
}

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

describe('agent-feedback auto-generate on next dev (enabled)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CLAUDECODE: '1' },
    nextConfig: {
      experimental: {
        agentFeedback: true,
      },
    },
  })

  it('creates a separate managed feedback block', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain(AGENT_RULES_MARKER)
    expect(content).toContain(AGENT_FEEDBACK_MARKER)
    expect(content).toContain('"schemaVersion":1')
    expect(content).toContain('`framework-behavior`')
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
    expect(fs.readFileSync(path.join(next.testDir, 'AGENTS.md'), 'utf-8')).toBe(
      before
    )
  })
})

describe('agent-feedback auto-generate on next dev (agentRules: false)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CLAUDECODE: '1' },
    nextConfig: {
      agentRules: false,
      experimental: {
        agentFeedback: true,
      },
    },
  })

  it('creates feedback instructions independently from agent rules', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain(AGENT_FEEDBACK_MARKER)
    expect(content).not.toContain(AGENT_RULES_MARKER)
    expect(fs.readFileSync(path.join(next.testDir, 'CLAUDE.md'), 'utf-8')).toBe(
      '@AGENTS.md\n'
    )
  })
})

describe('agent-feedback auto-generate on next dev (stale CLAUDE.md block)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CLAUDECODE: '1' },
    nextConfig: {
      agentRules: false,
      experimental: {
        agentFeedback: true,
      },
    },
    skipStart: true,
  })

  beforeAll(async () => {
    await next.patchFile(
      'CLAUDE.md',
      '# Team rules\r\n\r\n<!-- BEGIN:nextjs-agent-feedback -->\r\nstale\r\n<!-- END:nextjs-agent-feedback -->\r\n'
    )
    await next.start()
  })

  it('refreshes CLAUDE.md in place and preserves CRLF line endings', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'CLAUDE.md'),
      'utf-8'
    )
    expect(content).toContain('# Team rules\r\n')
    expect(content).toContain('"schemaVersion":1')
    expect(content).not.toContain('stale')
    expect(content).not.toMatch(/(?<!\r)\n/)
    expect(fs.existsSync(path.join(next.testDir, 'AGENTS.md'))).toBe(false)
  })
})

describe('agent-feedback auto-generate on next dev (no agent)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
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
    nextConfig: {
      agentRules: false,
      experimental: {
        agentFeedback: true,
      },
    },
  })

  it('does not create feedback instructions without a detected agent', async () => {
    await next.fetch('/')
    expect(fs.existsSync(path.join(next.testDir, 'AGENTS.md'))).toBe(false)
    expect(fs.existsSync(path.join(next.testDir, 'CLAUDE.md'))).toBe(false)
  })
})

describe('agent-feedback auto-generate on next dev (disabled)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CLAUDECODE: '1' },
    nextConfig: {
      agentRules: false,
    },
    skipStart: true,
  })

  beforeAll(async () => {
    await next.patchFile(
      'AGENTS.md',
      `# Team rules\n\nKeep this content.\n\n${currentAgentRulesBlock()}\n\n${currentAgentFeedbackBlock()}\n`
    )
    await next.start()
  })

  it('removes only the managed feedback block', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain('Keep this content.')
    expect(content).toContain(AGENT_RULES_MARKER)
    expect(content).not.toContain(AGENT_FEEDBACK_MARKER)
  })
})
