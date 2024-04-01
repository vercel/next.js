import execa from 'execa'
import { fetchViaHTTP, findPort, killApp, launchApp } from 'next-test-utils'
import { join } from 'path'

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

export async function tryNextDev({
  cwd,
  projectName,
  isApp = true,
}: {
  cwd: string
  projectName: string
  isApp?: boolean
}) {
  const dir = join(cwd, projectName)
  const port = await findPort()
  const app = await launchApp(dir, port)

  try {
    const res = await fetchViaHTTP(port, '/')
    expect(await res.text()).toContain('Get started by editing')
    expect(res.status).toBe(200)

    if (!isApp) {
      const apiRes = await fetchViaHTTP(port, '/api/hello')
      expect(await apiRes.json()).toEqual({ name: 'John Doe' })
      expect(apiRes.status).toBe(200)
    }
  } finally {
    await killApp(app)
  }
}

export {
  createNextApp,
  projectFilesShouldExist,
  shouldBeTemplateProject,
  shouldBeJavascriptProject,
  shouldBeTypescriptProject,
  spawnExitPromise,
} from './lib/utils'
export { useTempDir } from '../../lib/use-temp-dir'
