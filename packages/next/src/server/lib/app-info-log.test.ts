import fs from 'fs'
import os from 'os'
import path from 'path'
import { warnIfMissingAgentRules, getAgentRulesDevError } from './app-info-log'

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

  it('is silent when the marker appears in AGENTS.md or CLAUDE.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), `${AGENT_RULES_MARKER}\n`)
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('prints the AGENT-addressed error when rules are missing', () => {
    process.env.CLAUDECODE = '1'
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const loggedMessage = errorSpy.mock.calls[0].join(' ')
    expect(loggedMessage).toContain('AGENT:')
    expect(loggedMessage).toContain('npx @next/codemod@latest agents-md')
    expect(loggedMessage).toContain('AGENTS.md/CLAUDE.md')
  })
})

describe('getAgentRulesDevError (dev-side hard gate with repeat-failure state)', () => {
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
    expect(getAgentRulesDevError(tmpDir, { skip: false })).toBeNull()
  })

  it('returns null when --skip-agent-rule-check is passed', () => {
    process.env.CLAUDECODE = '1'
    expect(getAgentRulesDevError(tmpDir, { skip: true })).toBeNull()
    // skip must not leave state behind — we haven't actually surfaced the
    // error yet, so the first real failure should still be treated as
    // "first time".
    expect(fs.existsSync(path.join(tmpDir, GATE_STATE_FILE))).toBe(false)
  })

  it('returns null when the marker is installed (and clears any prior state)', () => {
    process.env.CLAUDECODE = '1'
    // Pre-seed the gate state file to simulate a prior failure.
    fs.mkdirSync(path.join(tmpDir, '.next', 'dev'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, GATE_STATE_FILE), '')
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)

    expect(getAgentRulesDevError(tmpDir, { skip: false })).toBeNull()
    // State file must be cleared so a future regression starts clean.
    expect(fs.existsSync(path.join(tmpDir, GATE_STATE_FILE))).toBe(false)
  })

  it('first failure: error contains install command but NOT the bypass hint', () => {
    process.env.CLAUDECODE = '1'

    const error = getAgentRulesDevError(tmpDir, { skip: false })
    expect(error).not.toBeNull()
    expect(error).toContain('AGENT:')
    expect(error).toContain('npx @next/codemod@latest agents-md')
    // Crucially: no bypass hint the first time around.
    expect(error).not.toContain('--skip-agent-rule-check')
    expect(error).not.toContain('last resort')

    // And the state file must now exist so the next run knows this is a
    // repeat failure.
    expect(fs.existsSync(path.join(tmpDir, GATE_STATE_FILE))).toBe(true)
  })

  it('second failure: error additionally mentions the bypass as a last resort', () => {
    process.env.CLAUDECODE = '1'

    // First call — primes the state file.
    getAgentRulesDevError(tmpDir, { skip: false })

    // Second call — should now surface the bypass hint.
    const error = getAgentRulesDevError(tmpDir, { skip: false })
    expect(error).not.toBeNull()
    expect(error).toContain('npx @next/codemod@latest agents-md')
    expect(error).toContain('--skip-agent-rule-check')
    expect(error).toContain('last resort')
  })

  it('after rules are installed and then removed, counter resets to first-failure behavior', () => {
    process.env.CLAUDECODE = '1'

    // First failure: no bypass.
    getAgentRulesDevError(tmpDir, { skip: false })
    expect(fs.existsSync(path.join(tmpDir, GATE_STATE_FILE))).toBe(true)

    // User installs rules. Gate clears state.
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)
    expect(getAgentRulesDevError(tmpDir, { skip: false })).toBeNull()
    expect(fs.existsSync(path.join(tmpDir, GATE_STATE_FILE))).toBe(false)

    // User removes the rules again. Next failure should be "first time".
    fs.unlinkSync(path.join(tmpDir, 'AGENTS.md'))
    const error = getAgentRulesDevError(tmpDir, { skip: false })
    expect(error).not.toBeNull()
    expect(error).not.toContain('--skip-agent-rule-check')
    expect(error).not.toContain('last resort')
  })
})
