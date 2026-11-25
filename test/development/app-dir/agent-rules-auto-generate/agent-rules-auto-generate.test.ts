import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import os from 'os'
import path from 'path'
import execa from 'execa'
import Conf from 'next/dist/compiled/conf'
import { writeAgentFiles } from 'next/dist/server/lib/generate-agent-files'

const AGENT_RULES_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'
const AGENT_FEEDBACK_MARKER = '<!-- BEGIN:nextjs-agent-feedback -->'
const AGENT_UPGRADE_MARKER = '<!-- BEGIN:nextjs-agent-upgrade -->'

/** Clears every variable `@vercel/detect-agent` inspects so no agent is detected. */
const NO_AGENT_ENV = {
  AI_AGENT: '',
  CURSOR_TRACE_ID: '',
  CURSOR_AGENT: '',
  GEMINI_CLI: '',
  CODEX_SANDBOX: '',
  CODEX_CI: '',
  CODEX_THREAD_ID: '',
  ANTIGRAVITY_AGENT: '',
  AUGMENT_AGENT: '',
  OPENCODE_CLIENT: '',
  CLAUDECODE: '',
  CLAUDE_CODE: '',
  REPL_ID: '',
  COPILOT_MODEL: '',
  COPILOT_ALLOW_ALL: '',
  COPILOT_GITHUB_TOKEN: '',
}

const NON_CI_ENV = {
  CI: '',
  CONTINUOUS_INTEGRATION: '',
  BUILD_NUMBER: '',
  RUN_ID: '',
  GITHUB_ACTIONS: '',
  NOW_BUILDER: '',
  STACK: '',
  NEXT_TELEMETRY_DISABLED: '',
}

/**
 * The canonical block as the version under test generates it,
 * obtained by running the real generator into a temp dir — the test
 * never hardcodes the wording.
 */
function currentAgentRulesBlock(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rules-'))
  writeAgentFiles(dir)
  return fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8').trimEnd()
}

/** A feedback block from an older version, used to check refresh and removal. */
function staleAgentFeedbackBlock(): string {
  return `${AGENT_FEEDBACK_MARKER}
stale feedback instructions
<!-- END:nextjs-agent-feedback -->`
}

describe('agent-rules auto-generate on next dev (agent detected)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CLAUDECODE: '1' },
  })

  it('creates only AGENTS.md at the project root when neither exists', async () => {
    // A request is required to synchronize the test with the auto-gen
    // hook — `✓ Ready in X` is logged before the config load that runs
    // the hook, so `next.start()` resolves too early. `next.fetch` blocks
    // on the request handler, which only becomes ready after the hook.
    await next.fetch('/')

    const agentsContent = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(agentsContent).toContain(AGENT_RULES_MARKER)
    expect(agentsContent).toContain('\n## This is NOT the Next.js you know\n')
    expect(agentsContent).toContain('node_modules/next/dist/docs/')
  })
})

describe('agent-rules auto-generate on next dev (no agent)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // Explicitly clear every env var the agent detector inspects so the
    // test doesn't inherit a detected agent from the host shell.
    env: NO_AGENT_ENV,
  })

  it('creates AGENTS.md when no agent is detected', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain(currentAgentRulesBlock())
    expect(content).toContain(AGENT_UPGRADE_MARKER)
    expect(content).not.toContain(AGENT_FEEDBACK_MARKER)
  })
})

describe('agent-rules auto-generate on next dev (agentRules: false)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: NO_AGENT_ENV,
    nextConfig: {
      agentRules: false,
    },
  })

  it('creates upgrade instructions independently from disabled agent rules', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain(AGENT_UPGRADE_MARKER)
    expect(content).not.toContain(AGENT_RULES_MARKER)
  })
})

describe('agent-rules auto-generate on next dev (AGENTS.md has an outdated managed block)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: NO_AGENT_ENV,
    skipStart: true,
  })

  // A block written by a different Next.js version — the content
  // between the markers should be upgraded in place while everything
  // around it is preserved. Uses synthetic body text so this test does
  // not depend on any particular shipped wording.
  const OUTDATED_BLOCK = `${AGENT_RULES_MARKER}
# Stale heading from an older Next.js

Stale body from an older Next.js.
<!-- END:nextjs-agent-rules -->`

  beforeAll(async () => {
    await next.patchFile(
      'AGENTS.md',
      `# Team rules\n\nUse tabs, not spaces.\n\n${OUTDATED_BLOCK}\n\n${AGENT_UPGRADE_MARKER}\nStale upgrade instructions.\n<!-- END:nextjs-agent-upgrade -->\n`
    )
    await next.start()
  })

  it('refreshes the block in place and preserves surrounding content', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain('Use tabs, not spaces.')
    expect(content).not.toContain('Stale body from an older Next.js.')
    expect(content).toContain(currentAgentRulesBlock())
    expect(content).not.toContain('Stale upgrade instructions.')
    expect(content.split(AGENT_UPGRADE_MARKER).length - 1).toBe(1)
    // Exactly one managed block — upgraded, not duplicated.
    expect(content.split(AGENT_RULES_MARKER).length - 1).toBe(1)
  })

  it('is idempotent across dev server restarts', async () => {
    await next.fetch('/')
    const before = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    await next.stop()
    await next.start()
    await next.fetch('/')
    const after = fs.readFileSync(path.join(next.testDir, 'AGENTS.md'), 'utf-8')
    expect(after).toBe(before)
  })
})

describe('agent-rules auto-generate on next dev (AGENTS.md exists without marker)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: NO_AGENT_ENV,
    skipStart: true,
  })

  beforeAll(async () => {
    // User-authored AGENTS.md without the managed marker — auto-gen
    // should upsert the block while preserving existing content.
    await next.patchFile('AGENTS.md', '# Team rules\n\nUse tabs, not spaces.\n')
    await next.start()
  })

  it('upserts the managed block and preserves existing content', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain('Use tabs, not spaces.')
    expect(content).toContain(AGENT_RULES_MARKER)
    expect(content).toContain(AGENT_UPGRADE_MARKER)
  })
})

describe('agent-feedback auto-generate on next dev (enabled)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { ...NO_AGENT_ENV, ...NON_CI_ENV },
    nextConfig: {
      experimental: {
        agentFeedback: true,
      },
    },
  })

  it('creates a separate managed feedback block', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain(AGENT_RULES_MARKER)
    expect(content).toContain(AGENT_FEEDBACK_MARKER)
    expect(content).toContain('\n## Report Next.js feedback\n')
    expect(content).toContain(
      'The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass.'
    )
    expect(content).toContain(
      'When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.'
    )
    expect(content).toContain('meaningful or recurring Next.js issues')
    expect(content).toContain('- Crashes, hangs, OOMs')
    expect(content).toContain('- Incorrect behavior, output, errors')
    expect(content).toContain(
      '- Missing, unclear, or conflicting documentation'
    )
    expect(content).toContain('- Unexpected CLI, codemod, Skill')
    expect(content).toContain(
      'Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.'
    )
    expect(content).toContain(
      'npx --no-install next internal agent-feedback-instructions'
    )
    expect(content).not.toContain('node node_modules/next/dist/bin/next')
    expect(content).toContain('without piping or truncating its output')
    expect(content).toContain(
      'Before the final response, run one reporting pass'
    )
    expect(content).toContain('If a network sandbox blocks it')
    expect(content).toContain(
      'if it still returns no output, continue normally'
    )
    expect(content).not.toContain('"schemaVersion":3')
  })

  it('is idempotent across dev server restarts', async () => {
    await next.fetch('/')
    const before = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    await next.stop()
    await next.start()
    await next.fetch('/')
    expect(fs.readFileSync(path.join(next.testDir, 'AGENTS.md'), 'utf-8')).toBe(
      before
    )
  })
})

describe('agent-feedback auto-generate on next dev (agentRules: false)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { ...NON_CI_ENV, CLAUDECODE: '1' },
    nextConfig: {
      agentRules: false,
      experimental: {
        agentFeedback: true,
      },
    },
  })

  it('creates feedback instructions independently from agent rules', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain(AGENT_FEEDBACK_MARKER)
    expect(content).not.toContain(AGENT_RULES_MARKER)
  })
})

describe('agent-feedback auto-generate on next dev (no agent)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { ...NO_AGENT_ENV, ...NON_CI_ENV },
    nextConfig: {
      agentRules: false,
      experimental: {
        agentFeedback: true,
      },
    },
  })

  it('creates feedback instructions without a detected agent', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain(AGENT_FEEDBACK_MARKER)
    expect(content).not.toContain(AGENT_RULES_MARKER)
  })
})

describe.each([
  {
    name: 'disabled by default',
    agentFeedback: undefined,
    telemetryDisabled: '',
  },
  { name: 'explicitly disabled', agentFeedback: false, telemetryDisabled: '' },
  {
    name: 'explicitly disabled during a temporary telemetry opt-out',
    agentFeedback: false,
    telemetryDisabled: '1',
  },
])(
  'agent-feedback auto-generate on next dev ($name)',
  ({ agentFeedback, telemetryDisabled }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      env: {
        ...NO_AGENT_ENV,
        ...NON_CI_ENV,
        NEXT_TELEMETRY_DISABLED: telemetryDisabled,
      },
      nextConfig: { experimental: { agentFeedback } },
      skipStart: true,
    })

    beforeAll(async () => {
      await next.patchFile(
        'AGENTS.md',
        `# Team rules\n${staleAgentFeedbackBlock()}\n# More rules\n\n${currentAgentRulesBlock()}\n`
      )
      await next.start()
    })

    it('removes only the managed feedback block', async () => {
      await next.fetch('/')
      const content = fs.readFileSync(
        path.join(next.testDir, 'AGENTS.md'),
        'utf-8'
      )
      expect(content).toContain('# Team rules\n# More rules')
      expect(content).toContain(AGENT_RULES_MARKER)
      expect(content).not.toContain(AGENT_FEEDBACK_MARKER)
    })
  }
)

describe('agent-rules auto-generate on next dev (disabled with existing blocks)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { ...NO_AGENT_ENV, ...NON_CI_ENV },
    nextConfig: {
      agentRules: false,
      experimental: {
        agentFeedback: true,
      },
    },
    skipStart: true,
  })

  beforeAll(async () => {
    await next.patchFile(
      'AGENTS.md',
      `# Team rules\n\nKeep this content.\n\n${currentAgentRulesBlock()}\n\n${staleAgentFeedbackBlock()}\n`
    )
    await next.start()
  })

  it('removes the managed rules block without a detected agent', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain('Keep this content.')
    expect(content).not.toContain(AGENT_RULES_MARKER)
    expect(content).toContain(AGENT_FEEDBACK_MARKER)
    expect(content).not.toContain('stale feedback instructions')
  })
})

describe('agent-feedback auto-generate on next dev (telemetry disabled)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      ...NON_CI_ENV,
      CLAUDECODE: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    nextConfig: {
      agentRules: false,
      experimental: {
        agentFeedback: true,
      },
    },
  })

  it('creates upgrade instructions without feedback instructions', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain(AGENT_UPGRADE_MARKER)
    expect(content).not.toContain(AGENT_FEEDBACK_MARKER)
  })
})

describe('agent-feedback auto-generate on next dev (CI)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { CLAUDECODE: '1', CI: '1' },
    nextConfig: {
      agentRules: false,
      experimental: {
        agentFeedback: true,
      },
    },
  })

  it('creates upgrade instructions without feedback instructions', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain(AGENT_UPGRADE_MARKER)
    expect(content).not.toContain(AGENT_FEEDBACK_MARKER)
  })
})

describe.each([
  {
    name: 'temporary telemetry opt-out',
    env: { ...NON_CI_ENV, NEXT_TELEMETRY_DISABLED: '1' },
  },
  { name: 'CI', env: { ...NON_CI_ENV, CI: '1' } },
])('agent-feedback preservation on next dev ($name)', ({ env }) => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { ...env, CLAUDECODE: '1' },
    nextConfig: {
      agentRules: false,
      experimental: {
        agentUpgrade: false,
        agentFeedback: true,
      },
    },
    skipStart: true,
  })

  it.each([
    ['a file containing only feedback', `${staleAgentFeedbackBlock()}\n`],
    [
      'a file containing other instructions',
      `# Team rules\n\n${staleAgentFeedbackBlock()}\n\n# More rules\n`,
    ],
  ])('preserves %s unchanged on startup', async (_name, content) => {
    await next.patchFile('AGENTS.md', content)
    await next.start()
    try {
      await next.fetch('/')
      expect(
        fs.readFileSync(path.join(next.testDir, 'AGENTS.md'), 'utf-8')
      ).toBe(content)
    } finally {
      await next.stop()
    }
  })
})

describe('agent-feedback CLI with project telemetry opt-out', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    nextConfig: {
      experimental: {
        agentFeedback: true,
      },
    },
  })
  const existingInstructions = `# Team rules\n\n${staleAgentFeedbackBlock()}\n`

  beforeAll(async () => {
    await next.patchFile('AGENTS.md', existingInstructions)
  })

  function runFeedbackInstructions(savedPreferencesDir?: string) {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...NON_CI_ENV,
      NODE_ENV: 'development',
      NEXT_PRIVATE_SKIP_CANARY_CHECK: '1',
    }
    // Model a fresh agent shell that has not exported the project opt-out.
    delete env.NEXT_TELEMETRY_DISABLED
    delete env.__NEXT_PROCESSED_ENV

    const preloadArgs = [
      '--require',
      path.join(__dirname, 'block-feedback-network.js'),
    ]
    if (savedPreferencesDir) {
      delete env.XDG_CONFIG_HOME
      env.NEXT_TEST_TELEMETRY_CONFIG_DIR = savedPreferencesDir
      preloadArgs.push(
        '--require',
        path.join(__dirname, 'feedback-telemetry-preferences.js')
      )
    }

    return execa(
      process.execPath,
      [
        ...preloadArgs,
        require.resolve('next/dist/bin/next', { paths: [next.testDir] }),
        'internal',
        'agent-feedback-instructions',
      ],
      { cwd: next.testDir, env, extendEnv: false, reject: false }
    )
  }

  it.each(['.env.local', '.env.development.local'])(
    'does not contact the remote gate when telemetry is disabled in %s',
    async (envFile) => {
      // First prove the command would contact the gate without the dotenv file.
      const control = await runFeedbackInstructions()
      expect(control.stderr).toContain(
        'Unexpected agent feedback network request'
      )
      expect(control.exitCode).toBe(1)

      await next.patchFile(envFile, 'NEXT_TELEMETRY_DISABLED=1\n')
      try {
        const result = await runFeedbackInstructions()
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toBe('')
        expect(result.stderr).toBe('')
        expect(
          fs.readFileSync(path.join(next.testDir, 'AGENTS.md'), 'utf-8')
        ).toBe(existingInstructions)
      } finally {
        await next.deleteFile(envFile)
      }
    }
  )

  it.each(['next_telemetry_disabled', 'Next_Telemetry_Disabled'])(
    'honors native environment casing for the dotenv opt-out %s',
    async (key) => {
      await next.patchFile('.env.local', `${key}=1\n`)
      try {
        const result = await runFeedbackInstructions()
        expect(result.stdout).toBe('')
        if (process.platform === 'win32') {
          expect(result.exitCode).toBe(0)
          expect(result.stderr).toBe('')
        } else {
          expect(result.exitCode).toBe(1)
          expect(result.stderr).toContain(
            'Unexpected agent feedback network request'
          )
        }
      } finally {
        await next.deleteFile('.env.local')
      }
    }
  )

  it.each(['.env.local', '.env.development.local'])(
    'does not follow a dotenv link in %s or contact the remote gate',
    async (envFile) => {
      const target = path.join(next.testDir, 'dotenv-link-target')
      fs.mkdirSync(target, { recursive: true })
      const link = path.join(next.testDir, envFile)
      // Junctions also work on Windows runners without symlink privileges.
      fs.symlinkSync(target, link, 'junction')
      try {
        const result = await runFeedbackInstructions()
        expect({
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        }).toEqual({
          exitCode: 0,
          stdout: '',
          stderr: '',
        })
      } finally {
        fs.unlinkSync(link)
      }
    }
  )

  it('does not read oversized dotenv files or contact the remote gate', async () => {
    await next.patchFile('.env.local', '#'.repeat(1024 * 1024 + 1))
    try {
      const result = await runFeedbackInstructions()
      expect({
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      }).toEqual({
        exitCode: 0,
        stdout: '',
        stderr: '',
      })
    } finally {
      await next.deleteFile('.env.local')
    }
  })

  it.each([false, true])(
    'preserves the saved telemetry preference (enabled: %s) when dotenv redirects XDG_CONFIG_HOME',
    async (enabled) => {
      const savedPreferencesDir = path.join(next.testDir, 'saved-preferences')
      const preferences = new Conf({
        projectName: 'nextjs',
        cwd: savedPreferencesDir,
      })
      preferences.set('telemetry.enabled', enabled)

      const redirectedDir = path
        .join(next.testDir, 'redirected-preferences')
        .replace(/\\/g, '/')
      await next.patchFile('.env.local', `XDG_CONFIG_HOME="${redirectedDir}"\n`)
      try {
        const result = await runFeedbackInstructions(savedPreferencesDir)
        expect(result.stdout).toBe('')
        if (enabled) {
          expect(result.exitCode).toBe(1)
          expect(result.stderr).toContain('Original telemetry environment')
          expect(result.stderr).toContain(
            'Unexpected agent feedback network request'
          )
          expect(result.stderr).not.toContain(
            'Redirected telemetry environment'
          )
        } else {
          expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
            exitCode: 0,
            stderr: '',
          })
        }
      } finally {
        await next.deleteFile('.env.local')
      }
    }
  )
})

// Disabling upgrade reminders must remove only their block, including without an agent.
describe.each([
  ['agent detected', { ...NO_AGENT_ENV, CLAUDECODE: '1' }],
  ['no agent', NO_AGENT_ENV],
])('agent-upgrade disabled on next dev (%s)', (_name, agentEnv) => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { ...NON_CI_ENV, ...agentEnv },
    nextConfig: {
      experimental: {
        agentUpgrade: false,
        agentFeedback: true,
      },
    },
    skipStart: true,
  })

  beforeAll(async () => {
    await next.patchFile(
      'AGENTS.md',
      `# Team rules\n\n${currentAgentRulesBlock()}\n\n${staleAgentFeedbackBlock()}\n\n${AGENT_UPGRADE_MARKER}\nstale upgrade instructions\n<!-- END:nextjs-agent-upgrade -->\n`
    )
    await next.start()
  })

  it('removes upgrade instructions and preserves user, documentation and feedback rules', async () => {
    await next.fetch('/')
    const content = fs.readFileSync(
      path.join(next.testDir, 'AGENTS.md'),
      'utf-8'
    )
    expect(content).toContain('# Team rules')
    expect(content).toContain(AGENT_RULES_MARKER)
    expect(content).toContain(AGENT_FEEDBACK_MARKER)
    expect(content).not.toContain(AGENT_UPGRADE_MARKER)
  })
})
