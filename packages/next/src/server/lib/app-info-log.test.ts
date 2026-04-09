import fs from 'fs'
import os from 'os'
import path from 'path'
import { warnIfMissingAgentRules, checkAgentRulesForDev } from './app-info-log'

const AGENT_RULES_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'
const GATE_STATE_FILE = path.join('.next', 'dev', 'agent-rules-gate-fired')

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

  it('is silent when the managed block is installed in AGENTS.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('is silent when the managed block is installed in CLAUDE.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), `${AGENT_RULES_MARKER}\n`)
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('fires when AGENTS.md exists without the managed block', () => {
    // A custom AGENTS.md without our marker does NOT count as installed —
    // what we care about is the Next.js directive, not file existence.
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '# Team rules\n\nUse tabs, not spaces.\n'
    )
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('prints the build-side notice when an agent is detected and the block is missing', () => {
    process.env.CLAUDECODE = '1'
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const loggedMessage = errorSpy.mock.calls[0].join(' ')

    // Install command + explanation of WHY it matters.
    expect(loggedMessage).toContain('npx @next/codemod@canary agents-md')
    expect(loggedMessage).toContain('AGENTS.md')
    expect(loggedMessage).toContain('CLAUDE.md')
    expect(loggedMessage).toContain('version-matched')
    expect(loggedMessage).toContain('accuracy')

    // Build-side notice is not a hard-exit; no `fatal:` or "exited".
    expect(loggedMessage).not.toContain('fatal:')
    expect(loggedMessage).not.toContain('dev server exited')
  })
})

describe('checkAgentRulesForDev (dev-side gate with retry unblock)', () => {
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

  it('returns null when the managed block is installed in AGENTS.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)
    expect(checkAgentRulesForDev(tmpDir)).toBeNull()
  })

  it('returns null when the managed block is installed in CLAUDE.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), `${AGENT_RULES_MARKER}\n`)
    expect(checkAgentRulesForDev(tmpDir)).toBeNull()
  })

  it('fires even when AGENTS.md exists but is missing the managed block', () => {
    // File existence alone isn't enough — we care specifically about the
    // managed block that the codemod installs. A custom AGENTS.md still
    // triggers the gate.
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '# Team rules\n\nUse tabs, not spaces.\n'
    )
    const result = checkAgentRulesForDev(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.fatal).toBe(true)
  })

  it('clears prior gate state when the managed block is installed', () => {
    process.env.CLAUDECODE = '1'
    // Pre-seed the state file to simulate a prior failure.
    fs.mkdirSync(path.join(tmpDir, '.next', 'dev'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, GATE_STATE_FILE), '')
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)

    expect(checkAgentRulesForDev(tmpDir)).toBeNull()
    expect(fs.existsSync(path.join(tmpDir, GATE_STATE_FILE))).toBe(false)
  })

  it('first failure returns the full fatal message with exit/benefit/escape discouragement', () => {
    process.env.CLAUDECODE = '1'

    const result = checkAgentRulesForDev(tmpDir)
    expect(result).not.toBeNull()
    expect(result!.fatal).toBe(true)

    const message = result!.message

    // Leads with git-style `fatal:` and an explicit exit symptom.
    expect(message.startsWith('fatal: dev server exited')).toBe(true)

    // States the cause.
    expect(message).toContain('AI coding agent')
    expect(message).toContain('AGENTS.md')
    expect(message).toContain('CLAUDE.md')

    // Explains WHY it matters (accuracy via version-matched docs).
    expect(message).toContain('version-matched')
    expect(message).toContain('accuracy')

    // Primary fix.
    expect(message).toContain('npx @next/codemod@canary agents-md')

    // Escape hatch disclosed AND discouraged, with a concrete reason.
    expect(message).toContain('re-running')
    expect(message).toContain('strongly discouraged')
    expect(message).toContain('stale API knowledge')

    // State file was written so the next run is treated as a repeat.
    expect(fs.existsSync(path.join(tmpDir, GATE_STATE_FILE))).toBe(true)
  })

  it('second failure is non-fatal and drops the fatal/exit/escape-hatch wording', () => {
    process.env.CLAUDECODE = '1'

    const first = checkAgentRulesForDev(tmpDir)
    const second = checkAgentRulesForDev(tmpDir)

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(first!.fatal).toBe(true)
    expect(second!.fatal).toBe(false)

    const message = second!.message

    // Softened message still tells the agent what's missing, the install
    // command, and why it matters.
    expect(message).toContain('npx @next/codemod@canary agents-md')
    expect(message).toContain('version-matched')
    expect(message).toContain('accuracy')

    // But drops the first-run-only framing: no `fatal:`, no "exited", no
    // escape-hatch disclosure (the server has already unblocked by virtue
    // of being on the second run; re-disclosing the mechanism would be
    // noise).
    expect(message).not.toContain('fatal:')
    expect(message).not.toContain('dev server exited')
    expect(message).not.toContain('strongly discouraged')
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

    // User removes the managed block again. Next failure must start a
    // fresh cycle — fatal again, not immediately soft.
    fs.unlinkSync(path.join(tmpDir, 'AGENTS.md'))
    const freshFailure = checkAgentRulesForDev(tmpDir)
    expect(freshFailure!.fatal).toBe(true)
  })
})
