import fs from 'fs'
import os from 'os'
import path from 'path'
import { warnIfMissingAgentRules } from './app-info-log'

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

describe('warnIfMissingAgentRules', () => {
  let tmpDir: string
  let errorSpy: jest.SpyInstance
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-'))
    // `Log.error` ultimately calls `console.error`; stubbing at that level
    // avoids `jest.spyOn` issues with `* as` namespace imports and lets us
    // assert on the stderr output directly.
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    originalEnv = { ...process.env }
    clearAgentEnv()
  })

  afterEach(() => {
    errorSpy.mockRestore()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    process.env = originalEnv
  })

  it('is silent when no agent is detected, even with no AGENTS.md', () => {
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('is silent when the marker appears in AGENTS.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('is silent when the marker appears in CLAUDE.md alone', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(
      path.join(tmpDir, 'CLAUDE.md'),
      `# My Project\n\n${AGENT_RULES_MARKER}\nRules here.\n<!-- END:nextjs-agent-rules -->\n`
    )
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('prints a stderr error directly addressed to agents when rules are missing', () => {
    process.env.CLAUDECODE = '1'
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).toHaveBeenCalledTimes(1)

    const loggedMessage = errorSpy.mock.calls[0].join(' ')

    // The install command must be the primary call-to-action.
    expect(loggedMessage).toContain('npx @next/codemod@latest agents-md')

    // Direct-addressee tag — LLM-based assistants parse `AGENT:` as "this
    // message is for me", which is what makes them act on it instead of
    // skimming past.
    expect(loggedMessage).toContain('AGENT:')

    // The message must reference BOTH AGENTS.md and CLAUDE.md because the
    // marker can live in either file, and agents should not be confused
    // into thinking only one is checked.
    expect(loggedMessage).toContain('AGENTS.md/CLAUDE.md')

    // Priority framing — tells the agent to do this before anything else.
    expect(loggedMessage).toContain('before any other Next.js work')

    // Rationale — explains WHY running the codemod matters, which makes
    // the instruction stick instead of being ignored as boilerplate.
    expect(loggedMessage).toContain('stale')

    // No bypass language — we removed the `--skip-agent-rule-check` flag,
    // so the error must not mention any way to "skip" or "bypass" the
    // notice either.
    expect(loggedMessage).not.toContain('--skip-agent-rule-check')
    expect(loggedMessage).not.toContain('bypass')
  })

  it('also fires when AGENTS.md exists without the marker', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '# My Project\n\nCustom team rules.\n'
    )
    warnIfMissingAgentRules(tmpDir)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const loggedMessage = errorSpy.mock.calls[0].join(' ')
    expect(loggedMessage).toContain('npx @next/codemod@latest agents-md')
    expect(loggedMessage).toContain('AGENT:')
  })
})
