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

describe('warnIfMissingAgentRules (build-side warning)', () => {
  let tmpDir: string
  let warnSpy: jest.SpyInstance
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-'))
    // `Log.warn` ultimately calls `console.warn`; stubbing at that level
    // avoids `jest.spyOn` issues with `* as` namespace imports.
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    originalEnv = { ...process.env }
    clearAgentEnv()
  })

  afterEach(() => {
    warnSpy.mockRestore()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    process.env = originalEnv
  })

  it('is silent when no agent is detected, even with no AGENTS.md', () => {
    warnIfMissingAgentRules(tmpDir)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('warns when an agent is detected and no AGENTS.md or CLAUDE.md exists', () => {
    process.env.CLAUDECODE = '1'
    warnIfMissingAgentRules(tmpDir)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const loggedMessage = warnSpy.mock.calls[0].join(' ')
    expect(loggedMessage).toContain('npx @next/codemod@latest agents-md')
  })

  it('warns when an agent is detected and AGENTS.md exists without the marker', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '# My Project\n\nCustom team rules.\n'
    )
    warnIfMissingAgentRules(tmpDir)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const loggedMessage = warnSpy.mock.calls[0].join(' ')
    expect(loggedMessage).toContain('npx @next/codemod@latest agents-md')
  })

  it('is silent when the marker appears in CLAUDE.md alone', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(
      path.join(tmpDir, 'CLAUDE.md'),
      `# My Project\n\n${AGENT_RULES_MARKER}\nRules here.\n<!-- END:nextjs-agent-rules -->\n`
    )
    warnIfMissingAgentRules(tmpDir)
    expect(warnSpy).not.toHaveBeenCalled()
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

  it('returns null when no agent is detected (humans are never blocked)', () => {
    expect(getAgentRulesDevError(tmpDir, { skip: false })).toBeNull()
  })

  it('returns null when --skip-agent-rule-check is passed, even with an agent and no rules', () => {
    process.env.CLAUDECODE = '1'
    expect(getAgentRulesDevError(tmpDir, { skip: true })).toBeNull()
  })

  it('returns null when the marker is installed in AGENTS.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)
    expect(getAgentRulesDevError(tmpDir, { skip: false })).toBeNull()
  })

  it('returns null when the marker is installed in CLAUDE.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), `${AGENT_RULES_MARKER}\n`)
    expect(getAgentRulesDevError(tmpDir, { skip: false })).toBeNull()
  })

  it('returns an error message framed around the install command, with the bypass flag as a last resort', () => {
    process.env.CLAUDECODE = '1'
    const error = getAgentRulesDevError(tmpDir, { skip: false })
    expect(error).not.toBeNull()
    // Primary call-to-action: run the codemod.
    expect(error).toContain('npx @next/codemod@latest agents-md')
    // Bypass is mentioned, but explicitly framed as a last resort so agents
    // and users don't treat it as a first-class option.
    expect(error).toContain('--skip-agent-rule-check')
    expect(error).toContain('last resort')
    // And it must appear after the install command, not before, so the
    // primary action is what the reader sees first.
    expect(error!.indexOf('npx @next/codemod@latest agents-md')).toBeLessThan(
      error!.indexOf('--skip-agent-rule-check')
    )
  })
})
