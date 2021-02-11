import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { execSync } from 'child_process'
import { fileExists } from './file-exists'
import {
  checkDependencies,
  getPackageInstallCommand,
} from './check-dependencies'
import matchAstBranch from './match-ast-branch'
import { printAndExit } from '../server/lib/utils'

type NodeDescriptor = { type: string; node?: object }
type BranchDescriptor = NodeDescriptor[]
type PurgeObject = { content?: string[] }
type TailwindCssConfig = { purge?: string[] | PurgeObject }
type TailwindCssManager = {
  isActive: boolean
  directory: string
  resolvedPluginFilename: string
  config: TailwindCssConfig
  _hasFile: (filename: string) => Promise<boolean>
  getResolvedCssFilename: () => string
  init(directory: string): Promise<void>
}

const tailwindCssManager: TailwindCssManager = {
  isActive: false,
  directory: '',
  resolvedPluginFilename: '',
  config: {},

  async _hasFile(filename: string): Promise<boolean> {
    return fileExists(path.join(this.directory, filename))
  },

  getResolvedCssFilename() {
    return require.resolve('tailwindcss/tailwind.css', {
      paths: [this.directory],
    })
  },

  async init(directory: string) {
    this.directory = directory

    // Check if the project uses built-in Tailwind CSS support:
    this.isActive =
      (await this._hasFile('tailwind.config.js')) &&
      !(await this._hasFile('postcss.config.js'))
    if (!this.isActive) {
      return
    }

    // Ensure Tailwind CSS is installed:
    const { resolvedPackagesMap, missingDependencies } = checkDependencies(
      this.directory,
      [{ filename: 'tailwindcss', packageName: 'tailwindcss' }]
    )
    if (missingDependencies.length) {
      printAndExit(
        chalk.bold(
          chalk.red(
            `It looks like you're trying to use Tailwind CSS but do not have the required packages installed.`
          ) +
            `\n\nPlease install tailwindcss, postcss, and autoprefixer by running:` +
            '\n\n\t' +
            chalk.cyan(
              (await getPackageInstallCommand(this.directory)) +
                ' tailwindcss@latest postcss@latest autoprefixer@latest'
            ) +
            `\n\nIf you are not trying to use Tailwind CSS, please remove the ${chalk.cyan(
              'tailwind.config.js'
            )} file from your package root.\n`
        )
      )
    }
    this.resolvedPluginFilename = resolvedPackagesMap.get('tailwindcss')!

    // Initialize config file if it is empty:
    const configPath = path.join(this.directory, 'tailwind.config.js')
    if (!fs.statSync(configPath).size) {
      fs.unlinkSync(configPath)
      const cwd = process.cwd()
      execSync(`cd ${this.directory} && npx tailwindcss init && cd ${cwd}`)
      console.log(
        chalk.green(
          `We detected Tailwind CSS in your project and initialized it by running ${chalk.bold(
            'npx tailwindcss init'
          )} for you.\n`
        )
      )
    }

    // Write PurgeCSS configuration defaults in tailwind.config.js
    // if the purge property is set to an empty array literal:
    const configCode = fs.readFileSync(configPath, 'utf8')
    const matchedNodes = matchAstBranch(configCode, [
      { type: 'Program' },
      { type: 'ExpressionStatement' },
      {
        type: 'AssignmentExpression',
        node: {
          operator: '=',
          left: {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: 'module' },
            property: { type: 'Identifier', name: 'exports' },
            computed: false,
          },
        },
      },
      { type: 'ObjectExpression' },
      {
        type: 'ObjectProperty',
        node: {
          key: { type: 'Identifier', name: 'purge' },
          value: { type: 'ArrayExpression', elements: { length: 0 } },
        },
      },
    ])
    if (matchedNodes.length) {
      const lastNode = matchedNodes[matchedNodes.length - 1]
      const purgeDefaults =
        "purge: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}']"
      fs.writeFileSync(
        configPath,
        configCode.substr(0, lastNode.start!) +
          purgeDefaults +
          configCode.substr(lastNode.end!),
        'utf8'
      )
      console.log(
        chalk.green(
          'We have set up purge defaults in your Tailwind CSS configuration file for you:\n' +
            chalk.bold(purgeDefaults) +
            '\n'
        )
      )
    }

    // Require config file and resolve purge filenames
    const config: TailwindCssConfig = require(configPath)
    if (config.purge && typeof config.purge === 'object') {
      if (Array.isArray(config.purge)) {
        config.purge = config.purge.map((filename) =>
          path.resolve(this.directory, filename)
        )
      } else {
        if (config.purge.content && Array.isArray(config.purge.content)) {
          config.purge.content = config.purge.content.map((filename) =>
            path.resolve(this.directory, filename)
          )
        }
      }
    }
    this.config = config
  },
}

export default tailwindCssManager
