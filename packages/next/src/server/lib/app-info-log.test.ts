import fs from 'fs'
import os from 'os'
import path from 'path'
import { warnIfMissingAgentRules, checkAgentRulesForDev } from './app-info-log'

const GATE_STATE_FILE = path.join('.next', 'dev', 'agent-rules-gate-fired')

const AGENT_RULES_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'

// Clear every env var `detectAgent()` inspects so the base state is
// "no agent detected" regardless of what the host has set.
function clearAgentEnv() {
  delete process.env.AI_AGENT
  delete process.env.CURSOR_TRACE_ID
  delete process.env.CURSOR_AGENT
  delete process.env.GEMINI_CLI
  delete process.env.CODEX_SANDBOX
  delete process.env.CODEX_CI
  delete process.env.CODEX_THREAD_ID
  delete process.env.ANTIGRAVITY_AGENT
  delete process.env.AUGMENT_AGENT
  delete process.env.OPENCODE_CLIENT
  delete process.env.CLAUDECODE
  delete process.env.CLAUDE_CODE
  delete process.env.CLAUDE_CODE_IS_COWORK
  delete process.env.REPL_ID
  delete process.env.COPILOT_MODEL
  delete process.env.COPILOT_ALLOW_ALL
  delete process.env.COPILOT_GITHUB_TOKEN
}

/**
 * The error and the build-side notice share a single body via
 * `baseAgentRulesMessage`. Both are framework-style errors: factual, no
 * direct-addressee tag, no claims about the reader, no bypass mentions.
 * These checks must hold for both call sites.
 */
function assertFactualFrameworkError(message: string) {
  // Must include the install command, pinned to `@canary` so users pick up
  // codemod updates on the faster release channel.
  expect(message).toContain('npx @next/codemod@canary agents-md')
  expect(message).toContain('AGENTS.md')
  expect(message).toContain('CLAUDE.md')

  // Must NOT contain anything that looks like a prompt-injection payload
  // or an agent-addressed directive — that's what triggered agents to
  // flag the message as suspicious in earlier iterations.
  expect(message).not.toContain('AGENT:')
  expect(message).not.toContain('stale')
  expect(message).not.toContain('Do this before')

  // Must NOT advertise any bypass — there is none, and mentioning one at
  // all gives frustrated agents permission to take it instead of the fix.
  expect(message).not.toContain('--skip-agent-rule-check')
  expect(message).not.toContain('bypass')
  expect(message).not.toContain('last resort')
}

describe('warnIfMissingAgentRules (build-side notice)', () => {
  let tmpDir: string
  let errorSpy: jest.SpyInstance
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-'))
    // `Log.error` ultimately calls `console.error`; stubbing at that level
    // avoids `jest.spyOn` issues with `* as` namespace imports.
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    originalEnv = { ...process.env }
    clearAgentEnv()
  })

  afterEach(() => {
    errorSpy.mockRestore()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    process.env = originalEnv
  })

  it('is silent when no agent is detected', () => {
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('is silent when the marker appears in AGENTS.md or CLAUDE.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), `${AGENT_RULES_MARKER}\n`)
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('prints a factual framework error when rules are missing', () => {
    process.env.CLAUDECODE = '1'
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const loggedMessage = errorSpy.mock.calls[0].join(' ')
    assertFactualFrameworkError(loggedMessage)
  })
})

describe('checkAgentRulesForDev (dev-side gate with retry softening)', () => {
  let tmpDir: string
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-dev-'))
    originalEnv = { ...process.env }
    clearAgentEnv()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    process.env = originalEnv
  })

  it('returns null when no agent is detected', () => {
    expect(checkAgentRulesForDev(tmpDir)).toBeNull()
  })

  it('returns null when the marker is installed in AGENTS.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)
    expect(checkAgentRulesForDev(tmpDir)).toBeNull()
  })

  it('returns null when the marker is installed in CLAUDE.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), `${AGENT_RULES_MARKER}\n`)
    expect(checkAgentRulesForDev(tmpDir)).toBeNull()
  })

  it('clears prior gate state when the marker is (re-)installed', () => {
    process.env.CLAUDECODE = '1'
    // Pre-seed the gate state file to simulate a prior failure.
    fs.mkdirSync(path.join(tmpDir, '.next', 'dev'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, GATE_STATE_FILE), '')
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)

    expect(checkAgentRulesForDev(tmpDir)).toBeNull()
    // State file must be cleared so a future regression starts fresh.
    expect(fs.existsSync(path.join(tmpDir, GATE_STATE_FILE))).toBe(false)
  })

  it('first failure is fatal, prefixed with `fatal:`, and writes the state marker', () => {
    process.env.CLAUDECODE = '1'

    const result = checkAgentRulesForDev(tmpDir)
    expect(result).not.toBeNull()
    // First failure must be fatal so the caller hard-exits.
    expect(result!.fatal).toBe(true)
    // First-run messages must lead with the git-style `fatal:` prefix so
    // agents (which are heavily trained on git output) treat the error as
    // authoritative rather than as a suggestion.
    expect(result!.message.startsWith('fatal: ')).toBe(true)
    assertFactualFrameworkError(result!.message)

    // The state file must now exist so the next run sees this as a repeat.
    expect(fs.existsSync(path.join(tmpDir, GATE_STATE_FILE))).toBe(true)
  })

  it('second failure is non-fatal (soft warning) and drops the `fatal:` prefix', () => {
    process.env.CLAUDECODE = '1'

    const first = checkAgentRulesForDev(tmpDir)
    const second = checkAgentRulesForDev(tmpDir)

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(first!.fatal).toBe(true)
    // Crucially: the second consecutive failure is soft. The caller logs
    // the message but lets dev startup continue, so nobody is permanently
    // locked out of the dev server.
    expect(second!.fatal).toBe(false)
    // Softened messages drop the `fatal:` prefix — they're semantically
    // less severe (server keeps running) and shouldn't look identical to
    // the hard-exit case.
    expect(second!.message.startsWith('fatal: ')).toBe(false)
    // But the body payload is the same — we deliberately don't advertise
    // the retry-softens behavior or any bypass.
    expect(second!.message).toBe(first!.message.replace(/^fatal: /, ''))
  })

  it('state resets after install + removal: first failure is fatal again', () => {
    process.env.CLAUDECODE = '1'

    // First failure: fatal, state written.
    const firstFailure = checkAgentRulesForDev(tmpDir)
    expect(firstFailure!.fatal).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, GATE_STATE_FILE))).toBe(true)

    // User installs rules. State cleared.
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)
    expect(checkAgentRulesForDev(tmpDir)).toBeNull()
    expect(fs.existsSync(path.join(tmpDir, GATE_STATE_FILE))).toBe(false)

    // User removes rules. Next failure must start a fresh cycle — fatal
    // again, not immediately soft.
    fs.unlinkSync(path.join(tmpDir, 'AGENTS.md'))
    const freshFailure = checkAgentRulesForDev(tmpDir)
    expect(freshFailure).not.toBeNull()
    expect(freshFailure!.fatal).toBe(true)
  })
})
