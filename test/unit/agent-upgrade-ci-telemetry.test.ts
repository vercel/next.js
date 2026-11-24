import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { load } from 'js-yaml'
import {
  eventAgentUpgradeCIInstallResult,
  eventAgentUpgradeCIInstallStarted,
} from 'next/dist/telemetry/events/agent-upgrade'

const runId = '2737afe3-1de2-4eec-a051-8e4c341c6a0e'

function report(results: unknown[], disabled: boolean, transportFails = false) {
  const reporter = resolve(
    __dirname,
    '../../.github/actions/next-upgrade/report-telemetry.mjs'
  )
  const eventsModule = require.resolve(
    'next/dist/telemetry/events/agent-upgrade'
  )
  const script = `
import { pathToFileURL } from 'node:url'
const { reporter, eventsModule, results, disabled, transportFails, runId } = JSON.parse(process.argv[1])
const { reportUpgradeTelemetry } = await import(pathToFileURL(reporter).href)
const events = await import(pathToFileURL(eventsModule).href)
const sent = []
for (const result of results) {
  await reportUpgradeTelemetry({
    events,
    transport: async event => {
      sent.push(event)
      if (transportFails) {
        throw new Error('Transport unavailable')
      }
    },
    disabled,
    runId,
    trigger: 'manual',
    startTime: Date.now(),
    targetCount: 5,
    result,
  })
}
console.log(JSON.stringify(sent))
`
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        script,
        JSON.stringify({
          reporter,
          eventsModule,
          results,
          disabled,
          transportFails,
          runId,
        }),
      ],
      { encoding: 'utf8' }
    )
  )
}

describe('scheduled upgrade telemetry', () => {
  it('distinguishes printed instructions from confirming an installation draft', () => {
    const installId = runId
    expect(eventAgentUpgradeCIInstallStarted({ installId })).toEqual({
      eventName: 'NEXT_AGENT_UPGRADE_CI_INSTALL_STARTED',
      payload: { schemaVersion: 1, installId },
    })
    for (const outcome of ['instructions_printed', 'draft_created'] as const) {
      expect(
        eventAgentUpgradeCIInstallResult({ installId, outcome, durationMs: 20 })
      ).toEqual({
        eventName: 'NEXT_AGENT_UPGRADE_CI_INSTALL_RESULT',
        payload: { schemaVersion: 1, installId, outcome, durationMs: 20 },
      })
    }
  })

  it('reports no completion for an interrupted run', () => {
    expect(report([null], false)).toEqual([
      {
        eventName: 'NEXT_AGENT_UPGRADE_CI_RUN_STARTED',
        payload: { schemaVersion: 1, runId, targetCount: 5, trigger: 'manual' },
      },
    ])
  })

  it('reports mixed outcomes and drops project and error details', () => {
    const result = {
      outcomes: [
        { status: 'no_upgrade', paths: ['apps/site'] },
        { status: 'existing_draft', url: 'https://example.com/pull/10' },
        { status: 'new_draft', url: 'https://example.com/pull/11' },
        { status: 'blocked' },
        { status: 'failed', failureStage: 'verification', error: 'raw error' },
      ],
    }
    expect(report([null, result], false)).toEqual([
      {
        eventName: 'NEXT_AGENT_UPGRADE_CI_RUN_STARTED',
        payload: { schemaVersion: 1, runId, targetCount: 5, trigger: 'manual' },
      },
      {
        eventName: 'NEXT_AGENT_UPGRADE_CI_RUN_RESULT',
        payload: {
          schemaVersion: 1,
          runId,
          trigger: 'manual',
          durationMs: expect.any(Number),
          noUpgrade: 1,
          existingDrafts: 1,
          newDrafts: 1,
          blocked: 1,
          failed: 1,
          failureStage: 'verification',
        },
      },
    ])
  })

  it('honors opt-out and handles transport failure', () => {
    expect(report([null, { outcomes: [] }], true)).toEqual([])
    expect(report([null, { outcomes: [] }], false, true)).toHaveLength(2)
  })

  it.each([
    ['reports', ''],
    ['honors NEXT_TELEMETRY_DISABLED in', '1'],
  ])('%s the workflow reporter process', (_, disabled) => {
    const temp = mkdtempSync(join(tmpdir(), 'next-upgrade-telemetry-'))
    try {
      const result = spawnSync(
        process.execPath,
        [
          resolve(
            __dirname,
            '../../.github/actions/next-upgrade/report-telemetry.mjs'
          ),
          'start',
        ],
        {
          cwd: temp,
          encoding: 'utf8',
          env: {
            ...process.env,
            // CI keeps telemetry preferences in the temporary directory.
            CI: '1',
            RUNNER_TEMP: temp,
            NEXT_TELEMETRY_DEBUG: '1',
            NEXT_TELEMETRY_DISABLED: disabled,
            NEXT_UPGRADE_TARGETS: JSON.stringify([
              { path: 'apps/web', policy: 'latest' },
            ]),
            NEXT_UPGRADE_TELEMETRY_RUN_ID: runId,
            NEXT_UPGRADE_TELEMETRY_STARTED_AT: String(Date.now()),
            GITHUB_EVENT_NAME: 'schedule',
          },
        }
      )
      expect(result.status).toBe(0)
      if (disabled) {
        expect(result.stderr).not.toContain('[telemetry]')
      } else {
        expect(result.stderr).toContain('NEXT_AGENT_UPGRADE_CI_RUN_STARTED')
        expect(result.stderr).toContain('"trigger": "schedule"')
        expect(result.stderr).not.toContain('apps/web')
      }
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  })

  function runReporter(phase: string, resultFile?: string | null) {
    const temp = mkdtempSync(join(tmpdir(), 'next-upgrade-telemetry-'))
    try {
      const publishResult = join(temp, 'result.json')
      if (resultFile) {
        writeFileSync(publishResult, resultFile)
      }
      const result = spawnSync(
        process.execPath,
        [
          resolve(
            __dirname,
            '../../.github/actions/next-upgrade/report-telemetry.mjs'
          ),
          phase,
        ],
        {
          cwd: temp,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI: '1',
            RUNNER_TEMP: temp,
            NEXT_TELEMETRY_DEBUG: '1',
            NEXT_TELEMETRY_DISABLED: '',
            NEXT_UPGRADE_TARGETS: JSON.stringify([
              { path: 'apps/web', policy: 'latest' },
            ]),
            NEXT_UPGRADE_PUBLISH_RESULT: publishResult,
            NEXT_UPGRADE_TELEMETRY_RUN_ID: runId,
            NEXT_UPGRADE_TELEMETRY_STARTED_AT: String(Date.now()),
            GITHUB_EVENT_NAME: 'workflow_dispatch',
          },
        }
      )
      expect(result.status).toBe(0)
      return result.stderr
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  }

  it.each([
    [
      'counts the published outcomes',
      'result',
      JSON.stringify({
        outcomes: [
          { paths: ['apps/web'], status: 'new_draft', url: 'https://x/1' },
        ],
      }),
      ['"newDrafts": 1', '"failureStage": null', '"trigger": "manual"'],
    ],
    [
      'reports a missing publication result as a publishing failure',
      'result',
      null,
      ['"failed": 1', '"failureStage": "publishing"'],
    ],
    [
      'reports a failed prepare job as a preflight failure',
      'prepare-failed',
      null,
      ['"failed": 1', '"failureStage": "preflight"'],
    ],
  ])('%s', (_, phase, resultFile, expected) => {
    const output = runReporter(phase, resultFile)
    expect(output).toContain('NEXT_AGENT_UPGRADE_CI_RUN_RESULT')
    for (const text of expected) {
      expect(output).toContain(text)
    }
    expect(output).not.toContain('apps/web')
    expect(output).not.toContain('https://x/1')
  })

  it('reports from a job without repository access that cannot fail the run', () => {
    const workflow = load(
      readFileSync(
        resolve(__dirname, '../../.github/workflows/next-upgrade.yml'),
        'utf8'
      )
    ) as { jobs: Record<string, Record<string, unknown>> }
    expect(workflow.jobs.report).toMatchObject({
      needs: ['prepare', 'publish'],
      'continue-on-error': true,
    })
    expect(workflow.jobs.report.permissions).toEqual({})
    // A rerun of failed jobs reports its attempt with a fresh run ID.
    expect(JSON.stringify(workflow.jobs.report)).toContain('GITHUB_RUN_ATTEMPT')
    // Only telemetry reads the publication result, so uploading it cannot
    // fail a publish job whose drafts were opened.
    expect(workflow.jobs.publish.steps).toContainEqual(
      expect.objectContaining({
        name: 'Upload the publication result',
        'continue-on-error': true,
      })
    )
  })
})

describe('scheduled upgrade setup opt-out detection', () => {
  it('lists workspace members from the committed lockfile on Windows', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const { lockfileImporters } = require('next/dist/lib/upgrade/setup-ci')
    // The fixture lockfile starts with pnpm's own environment document.
    const lockfile = readFileSync(
      join(
        __dirname,
        '../e2e/agent-upgrade-ci/fixtures/workspace/pnpm-lock.yaml'
      ),
      'utf8'
    )
    // The same members pnpm list reports for the fixture.
    expect(lockfileImporters(lockfile).sort()).toEqual([
      '.',
      'apps/admin',
      'apps/docs',
      'apps/web',
      'packages/shared',
    ])
    expect(() => lockfileImporters("lockfileVersion: '9.0'\n")).toThrow(
      'Could not read the workspace packages from pnpm-lock.yaml.'
    )
  })

  it('reads project files from Git objects on Windows', () => {
    const fs = require('node:fs') as typeof import('node:fs')
    const { execFileSync } =
      require('node:child_process') as typeof import('node:child_process')
    const { tmpdir } = require('node:os') as typeof import('node:os')
    const { join } = require('node:path') as typeof import('node:path')
    const {
      projectPathExists,
      readProjectText,
    } = require('next/dist/lib/upgrade/setup-ci')
    const root = fs.realpathSync(
      fs.mkdtempSync(join(tmpdir(), 'next-upgrade-git-'))
    )
    const outside = fs.mkdtempSync(join(tmpdir(), 'next-upgrade-outside-'))
    try {
      const git = (...args: string[]) =>
        execFileSync('git', args, { cwd: root, stdio: 'ignore' })
      git('init')
      fs.mkdirSync(join(root, 'apps/web/app'), { recursive: true })
      fs.writeFileSync(join(root, 'apps/web/app/page.js'), '')
      fs.writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
      git('add', '.')
      git(
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        'Add files'
      )
      // Swap the committed lockfile for a link after it was committed.
      fs.writeFileSync(join(outside, 'lock'), "lockfileVersion: '6.0'\n")
      fs.rmSync(join(root, 'pnpm-lock.yaml'))
      fs.symlinkSync(join(outside, 'lock'), join(root, 'pnpm-lock.yaml'))
      const lockfile = join(root, 'pnpm-lock.yaml')
      // Windows reads the committed file and never opens the link.
      expect(readProjectText(root, lockfile, 'win32')).toBe(
        "lockfileVersion: '9.0'\n"
      )
      expect(projectPathExists(root, join(root, 'apps/web/app'), 'win32')).toBe(
        true
      )
      expect(
        projectPathExists(root, join(root, 'apps/web/pages'), 'win32')
      ).toBe(false)
      expect(() =>
        readProjectText(root, join(root, 'missing.yaml'), 'win32')
      ).toThrow(
        'On Windows, setup reads committed project files. Commit missing.yaml'
      )
      // Other platforms read the checkout.
      expect(readProjectText(root, lockfile, 'linux')).toBe(
        "lockfileVersion: '6.0'\n"
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('requires an explicit policy on Windows instead of loading app config', () => {
    const { implicitPolicyError } = require('next/dist/lib/upgrade/setup-ci')
    expect(implicitPolicyError(true, 'win32')?.message).toBe(
      'On Windows, choose the upgrade policy explicitly: next upgrade --ci security or next upgrade --ci latest.'
    )
    expect(implicitPolicyError('latest', 'win32')).toBeNull()
    expect(implicitPolicyError(true, 'linux')).toBeNull()
  })

  it('never opens dotenv files on Windows', () => {
    // Keep the test self-contained; earlier layers import fewer helpers.
    const fs = require('node:fs') as typeof import('node:fs')
    const { tmpdir } = require('node:os') as typeof import('node:os')
    const { join } = require('node:path') as typeof import('node:path')
    const { mkdtempSync, rmSync, writeFileSync } = fs
    const { readEnvTelemetryOptOut } = require('next/dist/lib/upgrade/setup-ci')
    const directory = mkdtempSync(join(tmpdir(), 'next-upgrade-env-'))
    try {
      writeFileSync(join(directory, '.env'), 'NEXT_TELEMETRY_DISABLED=\n')
      // Elsewhere the empty value is read, so telemetry stays on.
      expect(readEnvTelemetryOptOut(directory, 'linux')).toBe('')
      const open = jest.spyOn(fs, 'openSync')
      const read = jest.spyOn(fs, 'readFileSync')
      try {
        // On Windows the file is never opened, so it counts as an opt-out.
        expect(readEnvTelemetryOptOut(directory, 'win32')).toBe('1')
        expect(open).not.toHaveBeenCalled()
        expect(read).not.toHaveBeenCalled()
      } finally {
        open.mockRestore()
        read.mockRestore()
      }
      // Without reading anything, Windows always counts as an opt-out.
      rmSync(join(directory, '.env'))
      expect(readEnvTelemetryOptOut(directory, 'win32')).toBe('1')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
