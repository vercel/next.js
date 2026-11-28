import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

describe('upgrade setup project files', () => {
  // The test plants a shell script and runs the Windows code path from a
  // POSIX shell, so it covers that path on Linux and macOS.
  if (process.platform === 'win32') {
    it('runs only on Linux and macOS', () => {})
    return
  }

  let root: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'next-upgrade-files-')))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('reads Git objects on Windows with Git from PATH, never from the checkout', () => {
    const gitDirectory = dirname(
      execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
    )
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    writeFileSync(join(root, 'package.json'), '{}\n')
    execFileSync('git', ['add', 'package.json'], { cwd: root })
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Upgrade test',
        '-c',
        'user.email=upgrade-fixture@example.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--quiet',
        '-m',
        'Add package.json',
      ],
      { cwd: root }
    )
    // A Git planted in the checkout, found first through a PATH entry such as
    // the project's node_modules/.bin.
    const marker = join(root, 'planted-ran')
    const planted = join(root, 'node_modules/.bin')
    mkdirSync(planted, { recursive: true })
    writeFileSync(
      join(planted, 'git'),
      `#!/bin/sh\ntouch ${JSON.stringify(marker)}\nexit 1\n`,
      { mode: 0o755 }
    )
    // A separate process, so the child processes setup starts see this PATH.
    const exists = execFileSync(
      process.execPath,
      [
        '-e',
        `const { projectPathExists } = require(${JSON.stringify(require.resolve('next/dist/lib/upgrade/setup-ci'))})
console.log(projectPathExists({ root: process.argv[1], path: process.argv[2], platform: 'win32' }))`,
        root,
        join(root, 'package.json'),
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: [planted, gitDirectory].join(delimiter) },
      }
    ).trim()

    expect(exists).toBe('true')
    expect(existsSync(marker)).toBe(false)
  })
})
