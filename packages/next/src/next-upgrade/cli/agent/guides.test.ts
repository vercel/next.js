import { ChildProcess } from 'child_process'
import { PassThrough } from 'stream'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import type { UpgradePreparation } from '../../shared/check-upgrade'
import { prepareUpgradeGuides } from './guides'

jest.mock('fs/promises', () => ({
  cp: jest.fn(),
  mkdir: jest.fn(),
  mkdtemp: jest.fn(),
  readFile: jest.fn(),
  rm: jest.fn(),
  writeFile: jest.fn(),
}))
jest.mock('../../../build/spinner', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('../../../lib/helpers/get-npx-command', () => ({
  getNpxCommand: () => 'npx',
}))
jest.mock('next/dist/compiled/cross-spawn', () => jest.fn())
const crossSpawn = jest.mocked(
  require('next/dist/compiled/cross-spawn') as typeof import('next/dist/compiled/cross-spawn')
)
const cliVersion: string = require('next/package.json').version
let preparedUpgrade: Extract<UpgradePreparation, { status: 'ready' }>
let renderPrompt: (worktree: boolean | null) => string

// Keep existing snapshots stable while testing the generated instructions directly.
function normalizedPrompt() {
  return [
    [
      renderPrompt(null)
        .replace(/\\+/g, '/')
        .replaceAll(
          'next@' + cliVersion + ' internal report-agent-upgrade',
          'next@<cli-version> internal report-agent-upgrade'
        ),
    ],
  ]
}
function normalizedFileWriteCalls() {
  return jest
    .mocked(writeFile)
    .mock.calls.map(([path, ...args]) => [
      String(path).replace(/\\+/g, '/'),
      ...args,
    ])
}

function normalizedCopiedSources(): string[] {
  return jest
    .mocked(cp)
    .mock.calls.map(([source]) => String(source).replace(/\\+/g, '/'))
}

function normalizedWriteFileCalls() {
  return normalizedFileWriteCalls().filter(([path]) =>
    String(path).includes('/skills/')
  )
}

describe('agent upgrade guides', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    preparedUpgrade = {
      status: 'ready',
      installedVersion: '14.1.1',
      targetVersion: '16.3.5',
      references: [
        'https://api.github.com/advisories?affects=next',
        'https://registry.npmjs.org/next',
      ],
      futureDefaults: [],
    }
    jest.mocked(mkdtemp).mockResolvedValue('/tmp/next-upgrade-test')
    jest.mocked(cp).mockResolvedValue(undefined)
    jest.mocked(readFile).mockResolvedValue('Run <codemod-command>')
    jest.mocked(mkdir).mockResolvedValue(undefined)
    jest.mocked(rm).mockResolvedValue(undefined)
    jest.mocked(writeFile).mockResolvedValue(undefined)
  })
  it('passes the complete migration prompt to an existing agent', async () => {
    renderPrompt = await prepareUpgradeGuides({
      directory: '/workspace/app',
      policy: 'security',
      upgrade: preparedUpgrade,
      verbose: false,
      runId: '<run-id>',
      cliVersion,
    })

    const [guidePath, guide] = jest.mocked(writeFile).mock.calls[0]
    expect(String(guidePath).replace(/\\+/g, '/')).toBe(
      '/tmp/next-upgrade-test/upgrade/different-major.md'
    )
    expect(String(guide)).toMatch(
      /^Run npx @next\/codemod@\S+ upgrade 16\.3\.5 --yes --skip-adoption$/
    )
    const copiedSources = normalizedCopiedSources()
    expect(copiedSources).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/next-upgrade/cli/agent/guides/shared.md'),
        expect.stringContaining(
          '/next-upgrade/cli/agent/guides/different-major.md'
        ),
        expect.stringContaining('/codemods.md'),
        expect.stringContaining('/version-15.md'),
        expect.stringContaining('/version-16.md'),
      ])
    )
    expect(
      copiedSources.some((source) =>
        source.includes('/next-upgrade/cli/agent/guides/future-defaults.md')
      )
    ).toBe(false)
    expect(normalizedPrompt()).toMatchInlineSnapshot(`
     [
       [
         "Read and follow "/tmp/next-upgrade-test/upgrade/shared.md" first. Attempt its applicable duplicate checks before changing files. If a check is unavailable, report it and continue. Stop only if you find equivalent work. Then read and follow every applicable instruction in "/tmp/next-upgrade-test/upgrade/different-major.md".

     We're upgrading the app in "/workspace/app" from Next.js 14.1.1 to 16.3.5 because the installed version is affected by a published security advisory.

     Follow the user's worktree choice. If they do not specify, use a separate Git worktree when the app is in a Git repository. Run upgrade commands from this app's corresponding directory in that worktree. If the app is not in a Git repository, upgrade it in place.

     Set \`experimental.agentUpgrade\` to "security" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

     References:
     - https://api.github.com/advisories?affects=next
     - https://registry.npmjs.org/next

     When this task ends, report its result once. After completing the requested upgrade and all applicable verification, run \`npx next@<cli-version> internal report-agent-upgrade <run-id> success\`. If the attempted upgrade remains unsuccessful after repairs or verification fails, run \`npx next@<cli-version> internal report-agent-upgrade <run-id> failure\`. If you stop for duplicate work, user cancellation, or an unavailable prerequisite, do not report success or failure. Explain the result to the user separately; never include project details or error text in the telemetry command.",
       ],
     ]
    `)
  })

  it('renders verbose codemod instructions in the guide', async () => {
    renderPrompt = await prepareUpgradeGuides({
      directory: '/workspace/app',
      policy: 'security',
      upgrade: preparedUpgrade,
      verbose: true,
      runId: '<run-id>',
      cliVersion,
    })

    const [guidePath, guide] = jest.mocked(writeFile).mock.calls[0]
    expect(String(guidePath).replace(/\\+/g, '/')).toBe(
      '/tmp/next-upgrade-test/upgrade/different-major.md'
    )
    expect(String(guide)).toMatch(/--skip-adoption --verbose$/)
  })

  it('passes the latest target to the existing agent', async () => {
    preparedUpgrade = {
      status: 'ready',
      installedVersion: '16.2.12',
      targetVersion: '16.3.5',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [],
    }

    renderPrompt = await prepareUpgradeGuides({
      directory: '/workspace/app',
      policy: 'latest',
      upgrade: preparedUpgrade,
      verbose: false,
      runId: '<run-id>',
      cliVersion,
    })

    expect(readFile).toHaveBeenCalledTimes(0)
    expect(writeFile).toHaveBeenCalledTimes(0)
    expect(
      normalizedCopiedSources().some((source) =>
        source.includes('/next-upgrade/cli/agent/guides/future-defaults.md')
      )
    ).toBe(false)
    expect(
      normalizedCopiedSources().some((source) => source.includes('/02-pages/'))
    ).toBe(false)
    expect(normalizedPrompt()).toMatchInlineSnapshot(`
     [
       [
         "Read and follow "/tmp/next-upgrade-test/upgrade/shared.md" first. Attempt its applicable duplicate checks before changing files. If a check is unavailable, report it and continue. Stop only if you find equivalent work. Then read and follow every applicable instruction in "/tmp/next-upgrade-test/upgrade/same-major.md".

     We're upgrading the app in "/workspace/app" from Next.js 16.2.12 to 16.3.5 because a newer stable Next.js release is available.

     Follow the user's worktree choice. If they do not specify, use a separate Git worktree when the app is in a Git repository. Run upgrade commands from this app's corresponding directory in that worktree. If the app is not in a Git repository, upgrade it in place.

     Set \`experimental.agentUpgrade\` to "latest" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

     References:
     - https://registry.npmjs.org/next/latest

     When this task ends, report its result once. After completing the requested upgrade and all applicable verification, run \`npx next@<cli-version> internal report-agent-upgrade <run-id> success\`. If the attempted upgrade remains unsuccessful after repairs or verification fails, run \`npx next@<cli-version> internal report-agent-upgrade <run-id> failure\`. If you stop for duplicate work, user cancellation, or an unavailable prerequisite, do not report success or failure. Explain the result to the user separately; never include project details or error text in the telemetry command.",
       ],
     ]
    `)
  })

  it('uses the same-major guide for a security update', async () => {
    preparedUpgrade = {
      status: 'ready',
      installedVersion: '15.0.0',
      targetVersion: '15.5.26',
      references: ['https://example.com/advisory'],
      futureDefaults: [],
    }

    renderPrompt = await prepareUpgradeGuides({
      directory: '/workspace/app',
      policy: 'security',
      upgrade: preparedUpgrade,
      verbose: false,
      runId: '<run-id>',
      cliVersion,
    })

    expect(normalizedPrompt().flat().join('\n')).toContain('/upgrade/shared.md')
    expect(normalizedPrompt().flat().join('\n')).toContain(
      '/upgrade/same-major.md'
    )
    expect(readFile).toHaveBeenCalledTimes(0)
    expect(writeFile).toHaveBeenCalledTimes(0)
    expect(normalizedCopiedSources()).toEqual([
      expect.stringContaining('/next-upgrade/cli/agent/guides/shared.md'),
      expect.stringContaining('/next-upgrade/cli/agent/guides/same-major.md'),
    ])
  })

  it('uses the different-major guide for a latest update', async () => {
    preparedUpgrade = {
      status: 'ready',
      installedVersion: '15.5.26',
      targetVersion: '16.3.5',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [],
    }

    renderPrompt = await prepareUpgradeGuides({
      directory: '/workspace/app',
      policy: 'latest',
      upgrade: preparedUpgrade,
      verbose: false,
      runId: '<run-id>',
      cliVersion,
    })

    expect(normalizedPrompt().flat().join('\n')).toContain(
      '/upgrade/different-major.md'
    )
    expect(
      normalizedCopiedSources().some((source) =>
        source.includes('/next-upgrade/cli/agent/guides/future-defaults.md')
      )
    ).toBe(false)
  })

  it('adds the Future Defaults guide after a different-major update', async () => {
    preparedUpgrade = {
      status: 'ready',
      installedVersion: '15.5.26',
      targetVersion: '16.3.5',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [],
    }

    renderPrompt = await prepareUpgradeGuides({
      directory: '/workspace/app',
      policy: 'experimental-future',
      upgrade: preparedUpgrade,
      verbose: false,
      runId: '<run-id>',
      cliVersion,
    })

    const prompt = normalizedPrompt().flat().join('\n')
    expect(prompt).toContain('/upgrade/different-major.md')
    expect(prompt).toContain('/upgrade/future-defaults.md')
    expect(normalizedCopiedSources()).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          '/next-upgrade/cli/agent/guides/future-defaults.md'
        ),
      ])
    )
  })

  it.each(['latest', 'experimental-future'] as const)(
    'hands off the exact canary target for %s upgrades',
    async (policy) => {
      preparedUpgrade = {
        status: 'ready',
        installedVersion: '17.2.0-canary.4',
        targetVersion: '17.2.0-canary.9',
        references: ['https://registry.npmjs.org/next/canary'],
        futureDefaults: [],
      }

      renderPrompt = await prepareUpgradeGuides({
        directory: '/workspace/app',
        policy: policy,
        upgrade: preparedUpgrade,
        verbose: false,
        runId: '<run-id>',
        cliVersion,
      })

      const prompt = normalizedPrompt().flat().join('\n')
      expect(prompt).toContain(
        'from Next.js 17.2.0-canary.4 to 17.2.0-canary.9'
      )
      expect(prompt).toContain(
        policy === 'latest'
          ? 'newer canary Next.js release'
          : 'latest canary release'
      )
      expect(prompt).toContain('https://registry.npmjs.org/next/canary')
      expect(readFile).toHaveBeenCalledTimes(0)
      expect(writeFile).toHaveBeenCalledTimes(0)
    }
  )

  it('names the stable target in a prerelease latest upgrade handoff', async () => {
    preparedUpgrade = {
      status: 'ready',
      installedVersion: '17.2.0-rc.1',
      targetVersion: '17.2.0',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [],
    }

    renderPrompt = await prepareUpgradeGuides({
      directory: '/workspace/app',
      policy: 'latest',
      upgrade: preparedUpgrade,
      verbose: false,
      runId: '<run-id>',
      cliVersion,
    })

    const prompt = normalizedPrompt().flat().join('\n')
    expect(prompt).toContain('from Next.js 17.2.0-rc.1 to 17.2.0')
    expect(prompt).toContain('newer stable Next.js release')
    expect(prompt).toContain('https://registry.npmjs.org/next/latest')
  })

  it('adds the Future Defaults guide after a same-major update', async () => {
    preparedUpgrade = {
      status: 'ready',
      installedVersion: '16.2.0',
      targetVersion: '16.4.0',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [
        {
          name: 'Cache Components',
          availableSince: '16.3.0',
          isAdopted: jest.fn(() => false),
          adoptionDoc: [
            'docs/01-app/02-guides/migrating-to-cache-components.md',
            'skills/next-cache-components-adoption/SKILL.md',
          ],
          optimizationDoc: ['skills/next-cache-components-optimizer/SKILL.md'],
          isApplicable: jest.fn(() => true),
        },
      ],
    }

    crossSpawn.mockImplementation(() => {
      const child = Object.assign(new ChildProcess(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      })
      process.nextTick(() => {
        child.stdout.emit('data', 'Adopt Cache Components safely.\n')
        child.emit('close', 0)
      })
      return child
    })

    renderPrompt = await prepareUpgradeGuides({
      directory: '/workspace/app',
      policy: 'experimental-future',
      upgrade: preparedUpgrade,
      verbose: false,
      runId: '<run-id>',
      cliVersion,
    })

    expect(crossSpawn).toHaveBeenCalledTimes(1)
    expect(readFile).toHaveBeenCalledTimes(0)
    expect(normalizedFileWriteCalls()).toEqual(normalizedWriteFileCalls())
    expect(normalizedCopiedSources()).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          '/next-upgrade/cli/agent/guides/future-defaults.md'
        ),
      ])
    )

    expect({
      prompt: normalizedPrompt(),
      savedInstructions: normalizedWriteFileCalls(),
    }).toMatchInlineSnapshot(`
     {
       "prompt": [
         [
           "Read and follow "/tmp/next-upgrade-test/upgrade/shared.md" first. Attempt its applicable duplicate checks before changing files. If a check is unavailable, report it and continue. Stop only if you find equivalent work. Then read and follow every applicable instruction in "/tmp/next-upgrade-test/upgrade/same-major.md".

     We're upgrading the app in "/workspace/app" from Next.js 16.2.0 to 16.4.0 because the Future policy applies the latest stable release and adopts its Future Defaults.

     Follow the user's worktree choice. If they do not specify, use a separate Git worktree when the app is in a Git repository. Run upgrade commands from this app's corresponding directory in that worktree. If the app is not in a Git repository, upgrade it in place.

     Set \`experimental.agentUpgrade\` to "experimental-future" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

     After completing and verifying the version update, read and follow "/tmp/next-upgrade-test/upgrade/future-defaults.md".
     Adopt these Future Defaults in order:
     - Cache Components
       - Read and follow "/tmp/next-upgrade-test/docs/01-app/02-guides/migrating-to-cache-components.md".
       - Read and follow "/tmp/next-upgrade-test/skills/next-cache-components-adoption/PROMPT.md".
     Complete each adoption. Temporary opt-outs and TODO markers are intermediate work only; do not stop until they are removed and the adoption is fully verified.

     References:
     - https://registry.npmjs.org/next/latest

     When this task ends, report its result once. After completing the requested upgrade and all applicable verification, run \`npx next@<cli-version> internal report-agent-upgrade <run-id> success\`. If the attempted upgrade remains unsuccessful after repairs or verification fails, run \`npx next@<cli-version> internal report-agent-upgrade <run-id> failure\`. If you stop for duplicate work, user cancellation, or an unavailable prerequisite, do not report success or failure. Explain the result to the user separately; never include project details or error text in the telemetry command.",
         ],
       ],
       "savedInstructions": [
         [
           "/tmp/next-upgrade-test/skills/next-cache-components-adoption/PROMPT.md",
           "Adopt Cache Components safely.
     ",
         ],
       ],
     }
    `)
  })

  it('uses only the Future Defaults guide when the version is unchanged', async () => {
    preparedUpgrade = {
      status: 'ready',
      installedVersion: '16.4.0',
      targetVersion: '16.4.0',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [
        {
          name: 'Cache Components',
          availableSince: '16.3.0',
          isAdopted: jest.fn(() => false),
          adoptionDoc: [
            'docs/01-app/02-guides/migrating-to-cache-components.md',
            'skills/next-cache-components-adoption/SKILL.md',
          ],
          optimizationDoc: ['skills/next-cache-components-optimizer/SKILL.md'],
          isApplicable: jest.fn(() => true),
        },
      ],
    }

    crossSpawn.mockImplementation(() => {
      const child = Object.assign(new ChildProcess(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      })
      process.nextTick(() => {
        child.stdout.emit('data', 'Adopt Cache Components safely.\n')
        child.emit('close', 0)
      })
      return child
    })

    renderPrompt = await prepareUpgradeGuides({
      directory: '/workspace/app',
      policy: 'experimental-future',
      upgrade: preparedUpgrade,
      verbose: false,
      runId: '<run-id>',
      cliVersion,
    })

    expect(
      jest
        .mocked(cp)
        .mock.calls.map(([source, destination]) =>
          [String(source), String(destination)].map((path) =>
            path.replace(/\\+/g, '/')
          )
        )
    ).toEqual(
      expect.arrayContaining([
        [
          expect.stringContaining(
            '/next-upgrade/cli/agent/guides/future-defaults.md'
          ),
          '/tmp/next-upgrade-test/upgrade/future-defaults.md',
        ],
      ])
    )
    expect(readFile).not.toHaveBeenCalled()
    expect(normalizedFileWriteCalls()).not.toContainEqual([
      '/tmp/next-upgrade-test/upgrade/future-defaults.md',
      expect.anything(),
    ])
    expect(normalizedPrompt()).toMatchInlineSnapshot(`
     [
       [
         "Read and follow "/tmp/next-upgrade-test/upgrade/shared.md" first. Attempt its applicable duplicate checks before changing files. If a check is unavailable, report it and continue. Stop only if you find equivalent work. Then read and follow every applicable instruction in "/tmp/next-upgrade-test/upgrade/future-defaults.md".

     We're adopting the Future Defaults available to the app in "/workspace/app", which already uses Next.js 16.4.0.

     Follow the user's worktree choice. If they do not specify, use a separate Git worktree when the app is in a Git repository. Run upgrade commands from this app's corresponding directory in that worktree. If the app is not in a Git repository, upgrade it in place.

     Set \`experimental.agentUpgrade\` to "experimental-future" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

     Adopt these Future Defaults in order:
     - Cache Components
       - Read and follow "/tmp/next-upgrade-test/docs/01-app/02-guides/migrating-to-cache-components.md".
       - Read and follow "/tmp/next-upgrade-test/skills/next-cache-components-adoption/PROMPT.md".
     Complete each adoption. Temporary opt-outs and TODO markers are intermediate work only; do not stop until they are removed and the adoption is fully verified.

     References:
     - https://registry.npmjs.org/next/latest

     When this task ends, report its result once. After completing the requested upgrade and all applicable verification, run \`npx next@<cli-version> internal report-agent-upgrade <run-id> success\`. If the attempted upgrade remains unsuccessful after repairs or verification fails, run \`npx next@<cli-version> internal report-agent-upgrade <run-id> failure\`. If you stop for duplicate work, user cancellation, or an unavailable prerequisite, do not report success or failure. Explain the result to the user separately; never include project details or error text in the telemetry command.",
       ],
     ]
    `)
  })
})
