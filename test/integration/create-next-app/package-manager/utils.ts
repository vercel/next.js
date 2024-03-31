import execa from 'execa'

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

export { projectFilesShouldExist } from '../lib/utils'
export { useTempDir } from '../../../lib/use-temp-dir'
