import execa from 'execa'
import resolveFrom from 'resolve-from'
import { realpath } from 'fs-extra'
import { fetchViaHTTP, findPort, killApp, launchApp } from 'next-test-utils'

export const CNA_PATH = require.resolve('create-next-app/dist/index.js')
export const EXAMPLE_PATH =
  'https://github.com/vercel/next.js/tree/canary/examples/basic-css'
export const DEFAULT_FILES = [
  '.gitignore',
  'package.json',
  'app/page.tsx',
  'app/layout.tsx',
  'node_modules/next',
]

export const run = (
  args: string[],
  {
    cwd,
    npm_config_user_agent,
  }: {
    cwd: string
    npm_config_user_agent?: string
  }
) =>
  execa('node', [CNA_PATH].concat(args), {
    stdio: 'inherit',
    cwd,
    env: {
      ...process.env,
      npm_config_user_agent,
    },
  })

export const command = (cmd: string, args: string[]) =>
  execa(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env },
  })

export const startsWithoutError = async (
  cwd: string,
  modes = ['default', 'turbo'],
  usingAppDirectory: boolean = false
) => {
  for (const mode of modes) {
    cwd = await realpath(cwd)
    const appPort = await findPort()
    const app = await launchApp(cwd, appPort, {
      turbo: mode === 'turbo',
      cwd: cwd,
      nextBin: resolveFrom(cwd, 'next/dist/bin/next'),
    })

    try {
      const res = await fetchViaHTTP(appPort, '/')
      expect(await res.text()).toContain('Get started by editing')
      expect(res.status).toBe(200)

      if (!usingAppDirectory) {
        const apiRes = await fetchViaHTTP(appPort, '/api/hello')
        expect(await apiRes.json()).toEqual({ name: 'John Doe' })
        expect(apiRes.status).toBe(200)
      }
    } finally {
      await killApp(app)
    }
  }
}

export {
  createNextApp,
  projectFilesShouldExist,
  shouldBeTemplateProject,
  spawnExitPromise,
} from './lib/utils'
export { useTempDir } from '../../lib/use-temp-dir'
