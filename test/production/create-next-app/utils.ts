import execa from 'execa'
import { join } from 'path'
import { createNext } from 'e2e-utils'

export const CNA_PATH = require.resolve('create-next-app/dist/index.js')
export const EXAMPLE_REPO = 'https://github.com/vercel/next.js/tree/canary'
export const EXAMPLE_PATH = 'examples/basic-css'
export const FULL_EXAMPLE_PATH = `${EXAMPLE_REPO}/${EXAMPLE_PATH}`
export const DEFAULT_FILES = [
  '.gitignore',
  'package.json',
  'app/page.tsx',
  'app/layout.tsx',
  'node_modules/next',
]

export const run = async (
  args: string[],
  nextJSVersion: string,
  options:
    | execa.Options
    | {
        reject?: boolean
        env?: Record<string, string>
      }
) => {
  return execa('node', [CNA_PATH].concat(args), {
    // tests with options.reject false are expected to exit(1) so don't inherit
    stdio: options.reject === false ? 'pipe' : 'inherit',
    ...options,
    env: {
      ...process.env,
      ...options.env,
      NEXT_PRIVATE_TEST_VERSION: nextJSVersion,
    },
  })
}

export const command = (cmd: string, args: string[]) =>
  execa(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env },
  })

export async function tryNextDev({
  cwd,
  projectName,
  isApp = true,
  isApi = false,
  isEmpty = false,
}: {
  cwd: string
  projectName: string
  isApp?: boolean
  isApi?: boolean
  isEmpty?: boolean
}) {
  const dir = join(cwd, projectName)
  const next = await createNext({
    files: dir,
    installCommand: 'true',
    skipStart: false,
  })

  try {
    const res = await next.fetch('/')
    if (isEmpty || isApi) {
      expect(await res.text()).toContain('Hello world!')
    } else {
      const responseText = await res.text()
      const hasAppRouterText =
        responseText.includes('To get started, edit the page.tsx file.') ||
        responseText.includes('To get started, edit the page.js file.')
      const hasPagesRouterText =
        responseText.includes('To get started, edit the index.tsx file.') ||
        responseText.includes('To get started, edit the index.js file.')
      expect(hasAppRouterText || hasPagesRouterText).toBe(true)
    }
    expect(res.status).toBe(200)

    if (!isApp && !isEmpty) {
      const apiRes = await next.fetch('/api/hello')
      expect(await apiRes.json()).toEqual({ name: 'John Doe' })
      expect(apiRes.status).toBe(200)
    }
  } finally {
    await next.destroy()
  }
}

export {
  createNextApp,
  projectFilesShouldExist,
  projectFilesShouldNotExist,
  projectShouldHaveNoGitChanges,
  shouldBeTemplateProject,
  shouldBeJavascriptProject,
  shouldBeTypescriptProject,
} from './lib/utils'
export { useTempDir } from '../../lib/use-temp-dir'
