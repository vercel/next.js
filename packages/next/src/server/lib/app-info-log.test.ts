import fs from 'fs'
import os from 'os'
import path from 'path'
import { warnIfMissingAgentRules, checkAgentRulesForDev } from './app-info-log'

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

  it('is silent when AGENTS.md exists (even empty)', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '')
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('is silent when CLAUDE.md exists (even empty)', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '')
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('prints the build-side notice when an agent is detected and neither file exists', () => {
    process.env.CLAUDECODE = '1'
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const loggedMessage = errorSpy.mock.calls[0].join(' ')
    // Build-side message is the plain install instruction — no `fatal:`
    // prefix (since the build isn't failing) and no escape-hatch sentence
    // (since the escape hatch is a dev-only concept).
    expect(loggedMessage).toContain('npx @next/codemod@canary agents-md')
    expect(loggedMessage).toContain('AGENTS.md')
    expect(loggedMessage).toContain('CLAUDE.md')
    expect(loggedMessage).not.toContain('fatal:')
    expect(loggedMessage).not.toContain('dev server exited')
  })
})

describe('checkAgentRulesForDev (dev-side hard gate)', () => {
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

  it('returns null when AGENTS.md exists (even empty — the escape hatch)', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '')
    expect(checkAgentRulesForDev(tmpDir)).toBeNull()
  })

  it('returns null when CLAUDE.md exists (even empty)', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '')
    expect(checkAgentRulesForDev(tmpDir)).toBeNull()
  })

  it('returns null when AGENTS.md has unrelated custom content', () => {
    // A user with their own custom AGENTS.md (e.g. team rules, no
    // Next.js-managed block) should not be nagged — their file existence
    // is the signal that they're aware of agent guidance for this project.
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '# Team rules\n\nUse tabs, not spaces.\n'
    )
    expect(checkAgentRulesForDev(tmpDir)).toBeNull()
  })

  it('returns the fatal error message when rules are missing', () => {
    process.env.CLAUDECODE = '1'
    const error = checkAgentRulesForDev(tmpDir)
    expect(error).not.toBeNull()

    // Leads with `fatal:` + explicit "dev server exited" symptom so the
    // agent sees both git-style authority and the cause-effect clearly.
    expect(error!.startsWith('fatal: dev server exited')).toBe(true)

    // States the cause (agent detected, no file).
    expect(error).toContain('AI coding agent')
    expect(error).toContain('AGENTS.md')
    expect(error).toContain('CLAUDE.md')

    // Primary fix: the codemod command.
    expect(error).toContain('npx @next/codemod@canary agents-md')

    // Escape hatch: create a file and re-run. Deliberately advertised in
    // the error text so a user who genuinely doesn't want the managed
    // block has a clear opt-out path.
    expect(error).toContain('create an empty')
    expect(error).toContain('run again')

    // No leftover bypass language from earlier iterations.
    expect(error).not.toContain('--skip-agent-rule-check')
    expect(error).not.toContain('last resort')
  })
})
