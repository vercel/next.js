#!/usr/bin/env node

import { existsSync, promises as fsPromises } from 'fs'
import path from 'path'
import { getProjectDir } from '../lib/get-project-dir'
import { printAndExit } from '../server/lib/utils'
import loadConfig from '../server/config'
import { PHASE_PRODUCTION_BUILD } from '../shared/lib/constants'
import { spawn } from 'child_process'

interface NextTestOptions {}

const nextTest = async (_options: NextTestOptions, directory?: string) => {
  const baseDir = getProjectDir(directory)

  // Check if the provided directory exists
  if (!existsSync(baseDir)) {
    printAndExit(`> No such directory exists as the project root: ${baseDir}`)
  }

  const nextConfig = await loadConfig(PHASE_PRODUCTION_BUILD, baseDir)
  const testConfig = nextConfig.test || {}
  const distDir = path.join(baseDir, nextConfig.distDir ?? '.next')
  const configuredTestDir = testConfig.testDir ?? 'app'

  // create a next-test.config.js file in the .next directory
  // TODO: This should change to `@next/test` in the future
  const configContent = `const { defineConfig } = require('next/experimental/testmode/playwright');
  const config = ${JSON.stringify(
    { ...testConfig, testDir: path.join(baseDir, configuredTestDir) },
    null,
    2
  )};
  module.exports = defineConfig(config);
  `
  const configPath = path.join(distDir, 'next-test.config.js')
  await fsPromises.writeFile(configPath, configContent, 'utf8')

  // Define the command to run Playwright tests
  const command = `npx`
  const commandArgs = ['playwright', 'test', '-c', configPath]

  const testProcess = spawn(command, commandArgs, {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: process.env,
    shell: true,
    cwd: baseDir,
  })

  process.on('SIGINT', () => {
    testProcess.kill('SIGINT')
  })

  process.on('SIGTERM', () => {
    testProcess.kill('SIGTERM')
  })
}

export { nextTest }
