import fs from 'fs'
import os from 'os'
import path from 'path'
import { warnIfMissingAgentRules, getAgentRulesDevError } from './app-info-log'

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

describe('getAgentRulesDevError (dev-side hard gate)', () => {
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
    expect(getAgentRulesDevError(tmpDir)).toBeNull()
  })

  it('returns null when the marker is installed in AGENTS.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)
    expect(getAgentRulesDevError(tmpDir)).toBeNull()
  })

  it('returns null when the marker is installed in CLAUDE.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), `${AGENT_RULES_MARKER}\n`)
    expect(getAgentRulesDevError(tmpDir)).toBeNull()
  })

  it('returns a factual framework error when rules are missing', () => {
    process.env.CLAUDECODE = '1'
    const error = getAgentRulesDevError(tmpDir)
    expect(error).not.toBeNull()
    assertFactualFrameworkError(error!)
  })
})
