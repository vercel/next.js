import fs from 'fs'
import os from 'os'
import path from 'path'
import { checkAgentRulesForDev, warnIfMissingAgentRules } from './app-info-log'

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
  delete process.env.NEXT_DISABLE_AGENT_RULE_CHECK
}

describe('warnIfMissingAgentRules', () => {
  let tmpDir: string
  let warnSpy: jest.SpyInstance
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-'))
    // Drop a `package.json` at the tmp dir root — the check anchors
    // on the nearest `package.json` walking up, so this is what
    // defines the fixture's "project root".
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name": "fixture"}')
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

  it('anchors the check at the nearest package.json walking up from a subdirectory', () => {
    // Simulates running `next dev` from a nested source directory.
    // The check anchors on the nearest `package.json` walking up,
    // so AGENTS.md at the fixture root (which has package.json)
    // is the file we check. AGENTS.md at the subdir itself would
    // NOT be checked because it's "below" the package.json level.
    process.env.CLAUDECODE = '1'
    const subDir = path.join(tmpDir, 'src', 'app')
    fs.mkdirSync(subDir, { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)

    warnIfMissingAgentRules(subDir)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('anchors on the nearest package.json, not the monorepo root', () => {
    // Monorepo layout: package.json at both the root and at
    // `apps/web/`. The check from `apps/web/` must anchor on
    // `apps/web/package.json` — the *nearest* one — and look for
    // AGENTS.md there, NOT at the monorepo root. A marker at the
    // monorepo root must not count.
    process.env.CLAUDECODE = '1'
    const appDir = path.join(tmpDir, 'apps', 'web')
    fs.mkdirSync(appDir, { recursive: true })
    fs.writeFileSync(path.join(appDir, 'package.json'), '{"name": "web"}')
    // Put the marker at the monorepo root (wrong place for an
    // `apps/web/` invocation).
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)

    warnIfMissingAgentRules(appDir)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('respects the marker when it is in the sub-package, not the monorepo root', () => {
    // Same monorepo layout as above, but the marker is now in the
    // sub-package (where it belongs). The check must find it.
    process.env.CLAUDECODE = '1'
    const appDir = path.join(tmpDir, 'apps', 'web')
    fs.mkdirSync(appDir, { recursive: true })
    fs.writeFileSync(path.join(appDir, 'package.json'), '{"name": "web"}')
    fs.writeFileSync(path.join(appDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)

    warnIfMissingAgentRules(appDir)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

describe('checkAgentRulesForDev (dev-side fatal gate)', () => {
  let tmpDir: string
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-dev-'))
    // `package.json` at the fixture root defines the Next.js project
    // root the dev-side check anchors on.
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name": "fixture"}')
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

  it('returns null when NEXT_DISABLE_AGENT_RULE_CHECK is set', () => {
    process.env.CLAUDECODE = '1'
    process.env.NEXT_DISABLE_AGENT_RULE_CHECK = '1'
    // Neither AGENTS.md nor CLAUDE.md exists — but the bypass env var
    // is set, so the gate must respect it and stay silent.
    expect(checkAgentRulesForDev(tmpDir)).toBeNull()
  })

  it('fires when an agent is detected, rules are missing, and no bypass is set', () => {
    process.env.CLAUDECODE = '1'

    const error = checkAgentRulesForDev(tmpDir)
    expect(error).not.toBeNull()
    const message = error!

    // Leads with title-cased `Fatal: Dev Server exited.` — the caller
    // will `process.exit(1)` right after, and this wording makes it
    // clear in the log that the process terminated intentionally.
    expect(message.startsWith('Fatal: Dev Server exited.')).toBe(true)

    // States the cause.
    expect(message).toContain('AI coding agent')
    expect(message).toContain('AGENTS.md')
    expect(message).toContain('CLAUDE.md')

    // Explains WHY the rules matter in concrete terms. These specific
    // phrases are what agents weigh heavily when deciding whether to
    // take the codemod path vs the escape path — losing any of them
    // significantly weakens the discouragement.
    expect(message).toContain('trained on older Next.js versions')
    expect(message).toContain('breaking changes')
    expect(message).toContain('deprecated APIs')
    expect(message).toContain('outdated patterns')
    expect(message).toContain('fail at runtime')

    // Primary fix — the codemod command.
    expect(message).toContain('npx @next/codemod@canary agents-md')

    // Escape hatch — disclosed, but env var not a CLI flag (agents
    // grab CLI flags more readily than env vars), and explicitly
    // framed as "Strongly discouraged" with a concrete negative
    // consequence attached.
    expect(message).toContain('NEXT_DISABLE_AGENT_RULE_CHECK=1')
    expect(message).toContain('Strongly discouraged')
    expect(message).toContain('last-resort')
    expect(message).toContain('far more time than the codemod takes to run')
  })
})
