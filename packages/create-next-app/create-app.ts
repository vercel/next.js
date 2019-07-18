import chalk from 'chalk'
import cpy from 'cpy'
import fs from 'fs'
import makeDir from 'make-dir'
import os from 'os'
import path from 'path'

import { downloadAndExtractExample, hasExample } from './helpers/examples'
import { install } from './helpers/install'
import { isFolderEmpty } from './helpers/is-folder-empty'
import { getOnline } from './helpers/is-online'
import { shouldUseYarn } from './helpers/should-use-yarn'

export async function createApp({
  appPath,
  useNpm,
  example,
}: {
  appPath: string
  useNpm: boolean
  example?: string
}) {
  if (example) {
    const found = await hasExample(example)
    if (!found) {
      console.error(
        `Could not locate an example named ${chalk.red(
          `"${example}"`
        )}. Please check your spelling and try again.`
      )
      process.exit(1)
    }
  }

  const root = path.resolve(appPath)
  const appName = path.basename(root)

  await makeDir(root)
  if (!isFolderEmpty(root, appName)) {
    process.exit(1)
  }

  const useYarn = useNpm ? false : shouldUseYarn()
  const isOnline = !useYarn || (await getOnline())
  const originalDirectory = process.cwd()

  const displayedCommand = useYarn ? 'yarn' : 'npm'
  console.log(`Creating a new Next.js app in ${chalk.green(root)}.`)
  console.log()

  await makeDir(root)
  process.chdir(root)

  if (example) {
    console.log(
      `Downloading files for example ${chalk.cyan(
        example
      )}. This might take a moment.`
    )
    console.log()
    await downloadAndExtractExample(root, example)

    console.log('Installing packages. This might take a couple of minutes.')
    console.log()

    await install(root, null, { useYarn, isOnline })
    console.log()
  } else {
    const packageJson = {
      name: appName,
      version: '0.1.0',
      private: true,
      scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
    }
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify(packageJson, null, 2) + os.EOL
    )

    console.log(
      `Installing ${chalk.cyan('react')}, ${chalk.cyan(
        'react-dom'
      )}, and ${chalk.cyan('next')} using ${displayedCommand}...`
    )
    console.log()

    await install(root, ['react', 'react-dom', 'next'], { useYarn, isOnline })
    console.log()

    await cpy('**', root, {
      parents: true,
      cwd: path.join(__dirname, 'templates', 'default'),
      rename: name => {
        switch (name) {
          case 'gitignore': {
            return '.'.concat(name)
          }
          default: {
            return name
          }
        }
      },
    })
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
