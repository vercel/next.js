/* eslint-disable import/no-extraneous-dependencies */
import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import retry from 'async-retry'

import { DownloadError, install, PackageManagerFlags, OutputMode } from '.'
import {
  downloadAndExtractExample,
  downloadAndExtractRepo,
  RepoInfo,
} from '../examples'
import { ExampleInfoContext } from '../get-example-info'
import { getTemplateFile } from '../../create-app'

export interface InstallExampleContext extends ExampleInfoContext {
  example?: string
  repoInfo?: RepoInfo
  root: string
  template: string
  outputMode: OutputMode
  installFlags: PackageManagerFlags
}

export const installFromExample = async ({
  example,
  repoInfo,
  root,
  template,
  outputMode,
  installFlags,
}: InstallExampleContext) => {
  if (!example) {
    throw new Error(`Invalid example: ${example}`)
  }
  try {
    if (repoInfo) {
      const repoInfo2 = repoInfo
      console.log(
        `Downloading files from repo ${chalk.cyan(
          example
        )}. This might take a moment.`
      )
      console.log()
      await retry(() => downloadAndExtractRepo(root, repoInfo2), {
        retries: 3,
      })
    } else {
      console.log(
        `Downloading files for example ${chalk.cyan(
          example
        )}. This might take a moment.`
      )
      console.log()
      await retry(() => downloadAndExtractExample(root, example), {
        retries: 3,
      })
    }
  } catch (reason) {
    throw new DownloadError(reason)
  }
  // Copy our default `.gitignore` if the application did not provide one
  const ignorePath = path.join(root, '.gitignore')
  if (!fs.existsSync(ignorePath)) {
    fs.copyFileSync(
      getTemplateFile(template, 'gitignore', outputMode),
      ignorePath
    )
  }

  console.log('Installing packages. This might take a couple of minutes.')
  console.log()

  await install(root, null, installFlags)
  console.log()
}
