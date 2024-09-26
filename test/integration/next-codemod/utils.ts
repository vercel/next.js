import execa from 'execa'
import { join } from 'node:path'
import { fetchViaHTTP, findPort, killApp, launchApp } from 'next-test-utils'
import { spawn, SpawnOptions } from 'node:child_process'

// export const NEXT_CODEMOD_PATH = require.resolve(
//   '@next/codemod/bin/next-codemod.js'
// )
export const CNA_PATH = require.resolve('create-next-app/dist/index.js')

export const runNextCodemod = (args: string[], options: execa.Options) => {
  const NEXT_CODEMOD_PATH = require.resolve(
    '@next/codemod/bin/next-codemod.js',
    {
      paths: [options.cwd ?? process.cwd()],
    }
  )
  console.log(`[TEST] $ ${NEXT_CODEMOD_PATH} ${args.join(' ')}`)

  return execa('node', [NEXT_CODEMOD_PATH].concat(args), {
    // tests with options.reject false are expected to exit(1) so don't inherit
    stdio: options.reject === false ? 'pipe' : 'inherit',
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  })
}

export const runNextCodemodPrompt = (args: string[], options: SpawnOptions) => {
  const NEXT_CODEMOD_PATH = require.resolve(
    '@next/codemod/bin/next-codemod.js',
    {
      paths: [(options.cwd as string) ?? process.cwd()],
    }
  )
  console.log(`[TEST] $ ${NEXT_CODEMOD_PATH} ${args.join(' ')}`, { options })

  return spawn('node', [NEXT_CODEMOD_PATH].concat(args), {
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  })
}

export const createApp = async (
  args: string[],
  nextJSVersion: string,
  options:
    | execa.Options
    | {
        reject?: boolean
        env?: Record<string, string>
      }
) => {
  console.log(`[TEST] $ ${CNA_PATH} ${args.join(' ')}`)

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

export async function tryNextDev({
  cwd,
  projectName,
}: {
  cwd: string
  projectName: string
}) {
  const dir = join(cwd, projectName)
  const port = await findPort()
  const app = await launchApp(dir, port, {
    nextBin: join(dir, 'node_modules/next/dist/bin/next'),
  })

  try {
    const res = await fetchViaHTTP(port, '/')
    expect(await res.text()).toContain('hello world')
  } finally {
    await killApp(app)
  }
}

export { useTempDir } from '../../lib/use-temp-dir'
