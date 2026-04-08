import fs from 'fs'
import os from 'os'
import path from 'path'
import { warnIfMissingAgentRules } from './app-info-log'

const AGENT_RULES_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'

describe('warnIfMissingAgentRules', () => {
  let tmpDir: string
  let warnSpy: jest.SpyInstance
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-'))
    // Log.warn ultimately calls console.warn; stubbing at that level avoids
    // jest.spyOn issues with `* as` namespace imports.
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    originalEnv = { ...process.env }
    // Clear every env var `detectAgent()` inspects so the base state is
    // "no agent detected" regardless of what the host has set.
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
    // The warning must surface the install command so agents know how to
    // fix it, not just that something is missing.
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
    // Even when a file exists, the warning must tell the user how to install
    // the rules — not just that the marker is missing.
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
