/* eslint-disable import/no-extraneous-dependencies */
import chalk from 'chalk'
import cpy from 'cpy'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { install } from '.'
import { getTemplateDir } from '../../create-app'
import { InstallTemplateContext, OutputMode } from './types'

const renameTemplateFiles = (name: string) => {
  switch (name) {
    case 'gitignore': {
      return '.gitignore'
    }
    // README.md is ignored by webpack-asset-relocator-loader used by ncc:
    // https://github.com/zeit/webpack-asset-relocator-loader/blob/e9308683d47ff507253e37c9bcbb99474603192b/src/asset-relocator.js#L227
    case 'README-template.md': {
      return 'README.md'
    }
    default: {
      return name
    }
  }
}

const logDependencies = (dependencyType: string, dependencies: string[]) => {
  console.log()
  console.log(`Installing ${dependencyType}:`)
  for (const dependency of dependencies) {
    console.log(`- ${chalk.cyan(dependency)}`)
  }
  console.log()
}

interface InstallTemplateDirectoryContext {
  root: string
  template: string
  outputMode: OutputMode
}

const installTemplateDirectory = async ({
  root,
  template,
  outputMode,
}: InstallTemplateDirectoryContext) => {
  const templateDirectory = getTemplateDir(template, outputMode)
  await cpy('**', root, {
    parents: true,
    cwd: templateDirectory,
    rename: renameTemplateFiles,
  })
}

export const installFromTemplate = async ({
  appName,
  root,
  options,
  template: initialTemplate,
  outputMode,
  installFlags,
}: InstallTemplateContext) => {
  /**
   * Create a package.json for the new project.
   */
  const packageJson = {
    name: appName,
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
    },
  }
  /**
   * Write it to disk.
   */
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2) + os.EOL
  )
  /**
   * Default dependencies.
   */
  const dependencies = ['react', 'react-dom']
  /**
   * Default devDependencies.
   */
  const devDependencies = ['next']
  /**
   * Add dependencies based on the given options here.
   */
  for (const [option, enabled] of Object.entries(options)) {
    if (!enabled) continue

    switch (option) {
      case 'typescript':
        /**
         * TypeScript projects will have type definitions and other devDependencies.
         */
        devDependencies.push('typescript', '@types/react', '@types/next')
        break

      case 'tailwind':
        /**
         * Tailwind will require a few devDependencies as well.
         * @see https://tailwindcss.com/docs/guides/nextjs
         */
        devDependencies.push(
          'tailwindcss@latest',
          'postcss@latest',
          'autoprefixer@latest'
        )
        break

      default:
        /**
         * Silently pass on any enabled options that do not imply additional
         * dependencies.
         */
        break
    }
  }
  /**
   * Install package.json dependencies if they exist.
   */
  if (dependencies.length) {
    logDependencies('dependencies', dependencies)
    await install(root, dependencies, installFlags)
  }
  /**
   * Install package.json devDependencies if they exist.
   */
  if (devDependencies.length) {
    logDependencies('devDependencies', devDependencies)
    const devInstallFlags = { devDependencies: true, ...installFlags }
    await install(root, devDependencies, devInstallFlags)
  }
  console.log()
  /**
   * Copy the initial template over. By default, this is the `default` template
   * for the given OutputMode (TS or JS).
   */
  await installTemplateDirectory({
    root,
    template: initialTemplate,
    outputMode,
  })
  /**
   * Finally, install additional template files based on the provided `options`.
   */
  for (const [option, enabled] of Object.entries(options)) {
    if (!enabled) continue
    switch (option) {
      case 'tailwind':
        /**
         * Install the Tailwind template files for the given OutputMode.
         */
        await installTemplateDirectory({
          root,
          template: 'tailwind',
          outputMode,
        })
        break

      default:
        /**
         * Silently pass on any enabled options that do not imply additional
         * templates, like `typescript: true`.
         */
        break
    }
  }
}
