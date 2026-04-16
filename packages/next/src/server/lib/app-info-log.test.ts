import fs from 'fs'
import os from 'os'
import path from 'path'
import { ensureAgentRulesForDev } from './app-info-log'

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

describe('ensureAgentRulesForDev (auto-generate agent files)', () => {
  let tmpDir: string
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-dev-'))
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name": "fixture"}')
    originalEnv = { ...process.env }
    clearAgentEnv()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    process.env = originalEnv
  })

  it('returns null when no agent is detected', () => {
    expect(ensureAgentRulesForDev(tmpDir)).toBeNull()
  })

  it('returns null when the managed block is already in AGENTS.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)
    expect(ensureAgentRulesForDev(tmpDir)).toBeNull()
  })

  it('returns null when the managed block is already in CLAUDE.md', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), `${AGENT_RULES_MARKER}\n`)
    expect(ensureAgentRulesForDev(tmpDir)).toBeNull()
  })

  it('creates both AGENTS.md and CLAUDE.md when neither exists', () => {
    process.env.CLAUDECODE = '1'
    const result = ensureAgentRulesForDev(tmpDir)

    expect(result).not.toBeNull()
    expect(result!.agentsMd).toBe('created')
    expect(result!.claudeMd).toBe('created')

    const agentsContent = fs.readFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(agentsContent).toContain(AGENT_RULES_MARKER)
    expect(agentsContent).toContain('node_modules/next/dist/docs/')

    const claudeContent = fs.readFileSync(
      path.join(tmpDir, 'CLAUDE.md'),
      'utf-8'
    )
    expect(claudeContent).toBe('@AGENTS.md\n')
  })

  it('upserts into existing AGENTS.md without the marker', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      '# Team rules\n\nUse tabs, not spaces.\n'
    )

    const result = ensureAgentRulesForDev(tmpDir)

    expect(result).not.toBeNull()
    expect(result!.agentsMd).toBe('updated')
    expect(result!.claudeMd).toBe('skipped')

    const content = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')
    expect(content).toContain('Use tabs, not spaces.')
    expect(content).toContain(AGENT_RULES_MARKER)
  })

  it('upserts into existing CLAUDE.md when AGENTS.md does not exist', () => {
    process.env.CLAUDECODE = '1'
    fs.writeFileSync(
      path.join(tmpDir, 'CLAUDE.md'),
      '# My rules\n\nBe concise.\n'
    )

    const result = ensureAgentRulesForDev(tmpDir)

    expect(result).not.toBeNull()
    expect(result!.agentsMd).toBe('skipped')
    expect(result!.claudeMd).toBe('updated')

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8')
    expect(content).toContain('Be concise.')
    expect(content).toContain(AGENT_RULES_MARKER)
  })

  it('only checks the Next.js project directory — a marker in an ancestor does not count', () => {
    process.env.CLAUDECODE = '1'
    const appDir = path.join(tmpDir, 'apps', 'web')
    fs.mkdirSync(appDir, { recursive: true })
    fs.writeFileSync(path.join(appDir, 'package.json'), '{"name": "web"}')
    // Marker at the monorepo root — wrong place for apps/web/
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)

    const result = ensureAgentRulesForDev(appDir)
    expect(result).not.toBeNull()
    expect(result!.agentsMd).toBe('created')
  })

  it('respects the marker when it is in the sub-package', () => {
    process.env.CLAUDECODE = '1'
    const appDir = path.join(tmpDir, 'apps', 'web')
    fs.mkdirSync(appDir, { recursive: true })
    fs.writeFileSync(path.join(appDir, 'package.json'), '{"name": "web"}')
    fs.writeFileSync(path.join(appDir, 'AGENTS.md'), `${AGENT_RULES_MARKER}\n`)

    expect(ensureAgentRulesForDev(appDir)).toBeNull()
  })
})
