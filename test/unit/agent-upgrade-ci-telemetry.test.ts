import {
  eventAgentUpgradeCIInstallResult,
  eventAgentUpgradeCIInstallStarted,
} from 'next/dist/telemetry/events/agent-upgrade'

describe('scheduled upgrade setup telemetry', () => {
  it('distinguishes printed instructions from confirming an installation draft', () => {
    const installId = '2737afe3-1de2-4eec-a051-8e4c341c6a0e'
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
