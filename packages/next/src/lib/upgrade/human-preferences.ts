import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { realpath } from 'fs/promises'
import { relative, resolve, sep } from 'path'
import { promisify } from 'util'
import Conf from 'next/dist/compiled/conf'

const exec = promisify(execFile)

export async function getUpgradePreferenceKey(
  directory: string
): Promise<string> {
  const app = await realpath(directory)
  let identity = app
  try {
    const git = async (args: string[]) =>
      (
        await exec('git', args, { cwd: app, timeout: 1000, windowsHide: true })
      ).stdout.trim()
    const root = await git(['rev-parse', '--show-toplevel'])
    const common = await realpath(
      resolve(app, await git(['rev-parse', '--git-common-dir']))
    )
    identity = `${common}\0${relative(root, app).split(sep).join('/')}`
  } catch {
    // Non-Git apps retain a stable local identity.
  }
  return createHash('sha256').update(identity).digest('hex')
}

export function upgradePreferences() {
  // Product preferences share Next.js' global config location, not telemetry consent.
  const conf = new Conf({ projectName: 'nextjs' })
  return {
    isDismissed(key: string, kind: string, version: string, policy: string) {
      return (
        conf.get(`upgrade.dismissals.${key}.${kind}`) === `${version}:${policy}`
      )
    },
    dismiss(key: string, kind: string, version: string, policy: string) {
      conf.set(`upgrade.dismissals.${key}.${kind}`, `${version}:${policy}`)
    },
  }
}
