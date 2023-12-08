import { config } from 'dotenv'

import execa from 'execa'
import path from 'path'
import url from 'url'
import { generatePackageJson } from './generate-package-json.js'
import { Listr } from 'listr2'
import { forceCrash } from './bench.js'
import { red } from '../../packages/next/dist/lib/picocolors.js'
import { resetProject } from '../../scripts/reset-project.mjs'

config()

export const TEST_PROJECT_NAME = process.env.VERCEL_TEST_PROJECT_NAME
const ORIGIN_PROJECT_NAME = TEST_PROJECT_NAME + '-origin'
const HEAD_PROJECT_NAME = TEST_PROJECT_NAME + '-head'

const TEST_TEAM_NAME = process.env.VERCEL_TEST_TEAM
const TEST_TOKEN = process.env.VERCEL_TEST_TOKEN
const VERCEL_EDGE_FUNCTIONS_BRIDGE_PKG =
  process.env.VERCEL_EDGE_FUNCTIONS_BRIDGE_PKG
const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const appFolder = path.join(__dirname, 'benchmark-app')
const originAppFolder = path.join(__dirname, 'benchmark-app-origin')
const headAppFolder = path.join(__dirname, 'benchmark-app-head')

export async function generateProjects() {
  const { originUrl, headUrl } = await new Listr(
    [
      {
        title: 'Origin project',
        task: (ctx, task) =>
          task.newListr(
            (parent) => [
              {
                title: 'Resetting project',
                task: async () => {
                  await resetProject({
                    teamId: TEST_TEAM_NAME,
                    projectName: ORIGIN_PROJECT_NAME,
                    disableDeploymentProtection: true,
                  })
                },
              },
              {
                title: 'copying app',
                task: async () => {
                  await execa('cp', ['-f', '-R', appFolder, originAppFolder])
                },
              },
              {
                title: 'Set Next.js version in package.json',
                task: async () => {
                  await generatePackageJson(originAppFolder)
                },
              },
              {
                title: 'deploying project',
                task: async () => {
                  const url = await deployProject(
                    ORIGIN_PROJECT_NAME,
                    originAppFolder
                  )
                  ctx.originUrl = url
                },
              },
            ],
            { concurrent: false }
          ),
      },
      {
        title: 'Head project',
        task: (ctx, task) =>
          task.newListr(
            (parent) => [
              {
                title: 'Resetting project',
                task: async () => {
                  await resetProject({
                    teamId: TEST_TEAM_NAME,
                    projectName: HEAD_PROJECT_NAME,
                    disableDeploymentProtection: true,
                  })
                },
              },
              {
                title: 'copying app',
                task: async () => {
                  await execa('cp', ['-f', '-R', appFolder, headAppFolder])
                },
              },
              {
                title: 'pack local Next.js version',
                task: async () => {
                  await generatePackageJson(headAppFolder, true)
                },
              },
              {
                title: 'deploying project',
                task: async () => {
                  const url = await deployProject(
                    HEAD_PROJECT_NAME,
                    headAppFolder
                  )
                  ctx.headUrl = url
                },
              },
            ],
            { concurrent: false }
          ),
      },
    ],
    { concurrent: true }
  ).run()

  return [originUrl, headUrl]
}

export async function cleanupProjectFolders() {
  await Promise.all([
    execa('rm', ['-rf', originAppFolder]),
    execa('rm', ['-rf', headAppFolder]),
  ])
}

export async function deployProject(projectName, appFolder) {
  try {
    const vercelFlags = ['--scope', TEST_TEAM_NAME]
    const vercelEnv = { ...process.env, TOKEN: TEST_TOKEN }

    // link the project
    const linkRes = await execa(
      'vercel',
      ['link', '-p', projectName, '--confirm', ...vercelFlags],
      {
        cwd: appFolder,
        env: vercelEnv,
      }
    )

    if (linkRes.exitCode !== 0) {
      throw new Error(
        `Failed to link project ${linkRes.stdout} ${linkRes.stderr} (${linkRes.exitCode})`
      )
    }

    const deployRes = await execa(
      'vercel',
      [
        'deploy',
        '--build-env',
        'NEXT_PRIVATE_TEST_MODE=1',
        '--build-env',
        'NEXT_TELEMETRY_DISABLED=1',
        ...(VERCEL_EDGE_FUNCTIONS_BRIDGE_PKG
          ? [
              '--build-env',
              `VERCEL_EDGE_FUNCTIONS_BRIDGE_PKG=${VERCEL_EDGE_FUNCTIONS_BRIDGE_PKG}`,
            ]
          : []),
        '--force',
        ...vercelFlags,
        ...(forceCrash ? ['--env', 'CRASH_FUNCTION=1'] : []),
      ],
      {
        cwd: appFolder,
        env: vercelEnv,
      }
    )

    if (deployRes.exitCode !== 0) {
      throw new Error(
        `Failed to deploy project ${linkRes.stdout} ${linkRes.stderr} (${linkRes.exitCode})`
      )
    }

    return deployRes.stdout
  } catch (err) {
    console.log(red('Deployment failed: ', err))
    throw err
  }
}
