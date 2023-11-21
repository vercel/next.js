import execa from 'execa'
import fsp from 'fs/promises'
import { join } from 'path'
import { setupTests } from './util'

const appDir = join(__dirname, '../app')
const imagesDir = join(appDir, '.next', 'cache', 'images')

describe('with latest sharp', () => {
  beforeAll(async () => {
    await fsp.writeFile(
      join(appDir, 'package.json'),
      JSON.stringify({
        packageManager: 'yarn@1.22.19',
      })
    )
    await execa('yarn', ['add', 'sharp'], {
      cwd: appDir,
      stdio: 'inherit',
    })
  })
  afterAll(async () => {
    await fsp.rm(join(appDir, 'node_modules'), { recursive: true, force: true })
    await fsp.rm(join(appDir, 'yarn.lock'), { recursive: true, force: true })
    await fsp.rm(join(appDir, 'package.json'), { recursive: true, force: true })
  })

  setupTests({ isSharp: true, isOutdatedSharp: false, appDir, imagesDir })
})
