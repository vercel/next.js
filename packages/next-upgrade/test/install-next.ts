import { execPackageManager } from './package-manager'
import { copyFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Keep legacy Next and its native packages out of the workspace dependency graph.
export function installNext(directory: string, version: string) {
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({
      private: true,
      packageManager: require('../../../package.json').packageManager,
      dependencies: { next: version },
    })
  )
  copyFileSync(
    join(__dirname, '../../../pnpm-workspace.yaml'),
    join(directory, 'pnpm-workspace.yaml')
  )
  execPackageManager(
    'pnpm',
    ['install', '--ignore-scripts', '--no-optional', '--prefer-offline'],
    { cwd: directory, stdio: 'pipe', encoding: 'utf8' }
  )
}
