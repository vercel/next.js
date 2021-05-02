/* eslint-disable import/no-extraneous-dependencies */
import chalk from 'chalk'
import path from 'path'

import { makeDir } from './helpers/make-dir'
import { tryGitInit } from './helpers/git'
import { isFolderEmpty } from './helpers/is-folder-empty'
import { getOnline } from './helpers/is-online'
import { shouldUseYarn } from './helpers/should-use-yarn'
import { isWriteable } from './helpers/is-writeable'
import { ExampleInfoContext, getExampleInfo } from './helpers/get-example-info'
import { OutputMode } from './helpers/install'
import { installFromExample } from './helpers/install/from-example'
import { installFromTemplate } from './helpers/install/from-template'

export interface NextCreateOptions {
  typescript?: boolean
  tailwind?: boolean
}

export interface CreateAppArgs extends ExampleInfoContext {
  appPath: string
  useNpm: boolean

  initialTemplate?: string
  options: NextCreateOptions
}

export const getTemplateDir = (template: string, mode: OutputMode) => {
  return path.join(__dirname, 'templates', mode, template)
}

export const getTemplateFile = (
  template: string,
  file: string,
  mode: OutputMode
) => {
  return path.join(getTemplateDir(template, mode), file)
}

/**
 * Create a new app by cloning an example repository and installing from
 * templates.
 *
 * Unless an example repo is provided or `initialTemplate` is overridden,
 * templates will be installed from `templates/js/default` or
 * `templates/ts/default` - else from `templates/js/{initialTemplate}`.
 */
export async function createApp({
  appPath,
  useNpm,
  example,
  examplePath,
  options,
  initialTemplate = 'default',
}: CreateAppArgs): Promise<void> {
  /**
   * Information about the provided example repo.
   */
  let repoInfo = await getExampleInfo({ example, examplePath })
  /**
   * Indicates whether to load JS or TS templates.
   */
  const outputMode: OutputMode = options.typescript ? 'ts' : 'js'
  /**
   * Verify that we have write permissions for the app's installation location.
   */
  const root = path.resolve(appPath)
  const rootIsWritable = await isWriteable(path.dirname(root))
  if (!rootIsWritable) {
    console.error(
      'The application path is not writable, please check folder permissions and try again.'
    )
    console.error(
      'It is likely you do not have write permissions for this folder.'
    )
    process.exit(1)
  }
  /**
   * Configuration information indicating whether or not to use Yarn, whether
   * the user is online,e tc.
   */
  const useYarn = useNpm ? false : shouldUseYarn()
  const displayedCommand = useYarn ? 'yarn' : 'npm'
  const isOnline = !useYarn || (await getOnline())
  const originalDirectory = process.cwd()

  console.log()
  console.log(`Creating a new Next.js app in ${chalk.green(root)}.`)
  console.log()

  /**
   * Create the app installation directory if it does not exist, then cd into
   * it.
   */
  const appName = path.basename(root)
  await makeDir(root)
  if (!isFolderEmpty(root, appName)) {
    process.exit(1)
  }
  process.chdir(root)
  /**
   * These will get passed to `install()`.
   */
  const installFlags = { useYarn, isOnline }
  /**
   * This information is used by all installs.
   */
  const installInfo = {
    root,
    template: initialTemplate,
    installFlags,
    outputMode,
  }

  if (example) {
    /**
     * If an example repository is provided, clone it.
     */
    await installFromExample({
      example,
      repoInfo,
      ...installInfo,
    })
  } else {
    /**
     * Otherwise, if an example repository is not provided for cloning, proceed
     * by installing from a template.
     *
     * Announce which package manager is being used, and what options are
     * enabled.
     */
    console.log(chalk.bold(`Using ${displayedCommand}.`))
    if (Object.keys(options).length) {
      console.log()
      console.log('Next app options:')
      for (const [option, enabled] of Object.entries(options)) {
        const enabledMsg = enabled ? chalk.green('yes') : chalk.red('no')
        console.log(`- ${chalk.bold(option)}: ${enabledMsg}`)
      }
    }

    await installFromTemplate({
      appName,
      options,
      ...installInfo,
    })
  }

  if (tryGitInit(root)) {
    console.log('Initialized a git repository.')
    console.log()
  }

  let cdpath: string
  if (path.join(originalDirectory, appName) === appPath) {
    cdpath = appName
  } else {
    cdpath = appPath
  }

  console.log(`${chalk.green('Success!')} Created ${appName} at ${appPath}`)
  console.log('Inside that directory, you can run several commands:')
  console.log()
  console.log(chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}dev`))
  console.log('    Starts the development server.')
  console.log()
  console.log(chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}build`))
  console.log('    Builds the app for production.')
  console.log()
  console.log(chalk.cyan(`  ${displayedCommand} start`))
  console.log('    Runs the built app in production mode.')
  console.log()
  console.log('We suggest that you begin by typing:')
  console.log()
  console.log(chalk.cyan('  cd'), cdpath)
  console.log(
    `  ${chalk.cyan(`${displayedCommand} ${useYarn ? '' : 'run '}dev`)}`
  )
  console.log()
}
