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
  let warnSpy: jest.SpyInstance
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-'))
    // Drop a `.git` sentinel at the tmp dir root so the walk-up inside
    // `hasAgentRulesInstalled` stops at the fixture boundary instead of
    // leaking into the developer's home directory.
    fs.mkdirSync(path.join(tmpDir, '.git'))
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

  it('is silent when no agent is detected, regardless of file state', () => {
    warnIfMissingAgentRules(tmpDir)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('is silent when the managed block is installed in AGENTS.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)
    warnIfMissingAgentRules(tmpDir)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('is silent when the managed block is installed in CLAUDE.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), `${AGENT_RULES_MARKER}\n`)
    warnIfMissingAgentRules(tmpDir)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('fires when AGENTS.md exists without the managed block', () => {
    // File existence alone isn't enough — we care specifically about
    // the Next.js directive, so a custom AGENTS.md without the marker
    // still counts as "not installed".
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '# Team rules\n\nUse tabs, not spaces.\n'
    )
    warnIfMissingAgentRules(tmpDir)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('fires when an agent is detected and neither file exists', () => {
    process.env.CLAUDECODE = '1'
    warnIfMissingAgentRules(tmpDir)
    expect(warnSpy).toHaveBeenCalledTimes(1)

    const loggedMessage = warnSpy.mock.calls[0].join(' ')

    // Install command + both filenames.
    expect(loggedMessage).toContain('npx @next/codemod@canary agents-md')
    expect(loggedMessage).toContain('AGENTS.md')
    expect(loggedMessage).toContain('CLAUDE.md')

    // Stick-framed content, deliberately. The words below are what
    // actually move agents: naming the negative consequence
    // ("incorrect" code from "outdated" API knowledge) and giving an
    // explicit sequencing instruction ("before making further code
    // changes") is what flips the agent's behavior from "noted and
    // continuing" to "I should address this first".
    expect(loggedMessage).toContain('outdated')
    expect(loggedMessage).toContain('incorrect')
    expect(loggedMessage).toContain('before making further code changes')

    // And crucially NOT carrot-framed — "improves accuracy" is the
    // wording that agents happily skim past, so if it ever sneaks back
    // in, this test should fail.
    expect(loggedMessage).not.toContain('improves')
    expect(loggedMessage).not.toContain('accuracy')

    // Non-fatal warning: no `fatal:` prefix, no "exited" symptom, no
    // escape-hatch disclosure — this path no longer blocks startup, so
    // none of that framing applies.
    expect(loggedMessage).not.toContain('fatal:')
    expect(loggedMessage).not.toContain('dev server exited')
    expect(loggedMessage).not.toContain('strongly discouraged')
  })

  it('walks up from a subdirectory to find AGENTS.md at the project root', () => {
    // Simulates running `next dev` from `apps/web/` in a monorepo where
    // AGENTS.md lives at the repo root. The walk-up should find it and
    // the gate stays silent.
    process.env.CLAUDECODE = '1'
    const subDir = path.join(tmpDir, 'apps', 'web')
    fs.mkdirSync(subDir, { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)

    warnIfMissingAgentRules(subDir)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('stops the walk-up at the .git project boundary', () => {
    // A stray AGENTS.md above the `.git` boundary must NOT be picked
    // up — that would be leaking agent guidance from an unrelated
    // parent directory into this project.
    process.env.CLAUDECODE = '1'
    const outerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outer-'))
    try {
      // Put the tmpDir's .git boundary one level in, and an AGENTS.md
      // with the marker ABOVE the boundary.
      fs.writeFileSync(
        path.join(outerDir, 'AGENTS.md'),
        `${AGENT_RULES_MARKER}\n`
      )
      const innerDir = path.join(outerDir, 'project')
      fs.mkdirSync(innerDir)
      fs.mkdirSync(path.join(innerDir, '.git'))

      warnIfMissingAgentRules(innerDir)
      // The stray outer AGENTS.md must NOT count — we stopped at the
      // `.git` boundary.
      expect(warnSpy).toHaveBeenCalledTimes(1)
    } finally {
      fs.rmSync(outerDir, { recursive: true, force: true })
    }
  })
})
