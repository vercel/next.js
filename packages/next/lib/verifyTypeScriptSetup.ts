import fs from 'fs'
import os from 'os'
import path from 'path'
import chalk from 'chalk'
import { promisify } from 'util'
import { recursiveReadDir } from './recursive-readdir'
import resolve from 'next/dist/compiled/resolve/index.js'

const exists = promisify(fs.exists)
const writeFile = promisify(fs.writeFile)

const resolveP = (req: string, opts: any): Promise<string> => {
  return new Promise((_resolve, reject) => {
    resolve(req, opts, (err, res) => {
      if (err) return reject(err)
      _resolve(res)
    })
  })
}

function writeJson(fileName: string, object: object): Promise<void> {
  return writeFile(
    fileName,
    JSON.stringify(object, null, 2).replace(/\n/g, os.EOL) + os.EOL
  )
}

async function verifyNoTypeScript(dir: string) {
  const typescriptFiles = await recursiveReadDir(
    dir,
    /.*\.(ts|tsx)$/,
    /(node_modules|.*\.d\.ts)/
  )

  if (typescriptFiles.length > 0) {
    console.warn(
      chalk.yellow(
        `We detected TypeScript in your project (${chalk.bold(
          `.${typescriptFiles[0]}`
        )}) and created a ${chalk.bold('tsconfig.json')} file for you.`
      )
    )
    console.warn()
    return false
  }
  return true
}

export async function verifyTypeScriptSetup(dir: string): Promise<void> {
  let firstTimeSetup = false
  const yarnLockFile = path.join(dir, 'yarn.lock')
  const tsConfigPath = path.join(dir, 'tsconfig.json')
  const toInstall: string[] = []

  if (!(await exists(tsConfigPath))) {
    if (await verifyNoTypeScript(dir)) {
      return
    }
    await writeJson(tsConfigPath, {})
    firstTimeSetup = true
  }
  const isYarn = await exists(yarnLockFile)

  // Ensure TypeScript is installed
  let typescriptPath = ''
  let ts: typeof import('typescript')

  try {
    await resolveP('@types/react/index.d.ts', { basedir: dir })
  } catch (_) {
    toInstall.push('@types/react')
  }

  try {
    typescriptPath = await resolveP('typescript', { basedir: dir })
    ts = require(typescriptPath)
  } catch (_) {
    toInstall.push('typescript')
    const toInstallStr = toInstall.join(' ')
    console.error(
      chalk.bold.red(
        `It looks like you're trying to use TypeScript but do not have ${chalk.bold(
          toInstallStr
        )} installed.`
      )
    )
    console.error(
      chalk.bold(
        'Please install',
        chalk.cyan.bold(toInstallStr),
        'by running',
        chalk.cyan.bold(
          (isYarn ? 'yarn add --dev' : 'npm install --save-dev') +
            ' ' +
            toInstallStr
        ) + '.'
      )
    )
    console.error(
      chalk.bold(
        'If you are not trying to use TypeScript, please remove the ' +
          chalk.cyan('tsconfig.json') +
          ' file from your package root (and any TypeScript files).'
      )
    )
    console.error()
    process.exit(1)
    return
  }

  const compilerOptions: any = {
    // These are suggested values and will be set when not present in the
    // tsconfig.json
    // 'parsedValue' matches the output value from ts.parseJsonConfigFileContent()
    target: {
      parsedValue: ts.ScriptTarget.ES5,
      suggested: 'es5',
    },
    lib: { suggested: ['dom', 'dom.iterable', 'esnext'] },
    allowJs: { suggested: true },
    skipLibCheck: { suggested: true },
    strict: { suggested: true },
    forceConsistentCasingInFileNames: { suggested: true },
    noEmit: { suggested: true },

    // These values are required and cannot be changed by the user
    // Keep this in sync with the webpack config
    esModuleInterop: {
      value: true,
      reason: 'requirement for babel',
    },
    module: {
      parsedValue: ts.ModuleKind.ESNext,
      value: 'esnext',
      reason: 'for dynamic import() support',
    },
    moduleResolution: {
      parsedValue: ts.ModuleResolutionKind.NodeJs,
      value: 'node',
      reason: 'to match webpack resolution',
    },
    resolveJsonModule: { value: true },
    isolatedModules: {
      value: true,
      reason: 'requirement for babel',
    },
    jsx: { parsedValue: ts.JsxEmit.Preserve, value: 'preserve' },
  }

  const formatDiagnosticHost = {
    getCanonicalFileName: (fileName: string) => fileName,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => os.EOL,
  }

  const messages = []
  let appTsConfig
  let parsedTsConfig
  let parsedCompilerOptions
  try {
    const { config: readTsConfig, error } = ts.readConfigFile(
      tsConfigPath,
      ts.sys.readFile
    )

    if (error) {
      throw new Error(ts.formatDiagnostic(error, formatDiagnosticHost))
    }

    appTsConfig = readTsConfig

    // Get TS to parse and resolve any "extends"
    // Calling this function also mutates the tsconfig, adding in "include" and
    // "exclude", but the compilerOptions remain untouched
    parsedTsConfig = JSON.parse(JSON.stringify(readTsConfig))
    const result = ts.parseJsonConfigFileContent(
      parsedTsConfig,
      ts.sys,
      path.dirname(tsConfigPath)
    )

    if (result.errors && result.errors.length) {
      throw new Error(
        ts.formatDiagnostic(result.errors[0], formatDiagnosticHost)
      )
    }

    parsedCompilerOptions = result.options
  } catch (e) {
    if (e && e.name === 'SyntaxError') {
      console.error(
        chalk.red.bold(
          'Could not parse',
          chalk.cyan('tsconfig.json') + '.',
          'Please make sure it contains syntactically correct JSON.'
        )
      )
    }

    console.info(e && e.message ? `${e.message}` : '')
    process.exit(1)
    return
  }

  if (appTsConfig.compilerOptions == null) {
    appTsConfig.compilerOptions = {}
    firstTimeSetup = true
  }

  for (const option of Object.keys(compilerOptions)) {
    const { parsedValue, value, suggested, reason } = compilerOptions[option]

    const valueToCheck = parsedValue === undefined ? value : parsedValue
    const coloredOption = chalk.cyan('compilerOptions.' + option)

    if (suggested != null) {
      if (parsedCompilerOptions[option] === undefined) {
        appTsConfig.compilerOptions[option] = suggested
        messages.push(
          `${coloredOption} to be ${chalk.bold(
            'suggested'
          )} value: ${chalk.cyan.bold(suggested)} (this can be changed)`
        )
      }
    } else if (parsedCompilerOptions[option] !== valueToCheck) {
      appTsConfig.compilerOptions[option] = value
      messages.push(
        `${coloredOption} ${chalk.bold(
          valueToCheck == null ? 'must not' : 'must'
        )} be ${valueToCheck == null ? 'set' : chalk.cyan.bold(value)}` +
          (reason != null ? ` (${reason})` : '')
      )
    }
  }

  // tsconfig will have the merged "include" and "exclude" by this point
  if (parsedTsConfig.exclude == null) {
    appTsConfig.exclude = ['node_modules']
  }

  if (parsedTsConfig.include == null) {
    appTsConfig.include = ['**/*.ts', '**/*.tsx']
  }

  if (messages.length > 0) {
    if (firstTimeSetup) {
      console.info(
        chalk.bold(
          'Your',
          chalk.cyan('tsconfig.json'),
          'has been populated with default values.'
        )
      )
      console.info()
    } else {
      console.warn(
        chalk.bold(
          'The following changes are being made to your',
          chalk.cyan('tsconfig.json'),
          'file:'
        )
      )
      messages.forEach(message => {
        console.warn('  - ' + message)
      })
      console.warn()
    }
    await writeJson(tsConfigPath, appTsConfig)
  }

  // Reference `next` types
  const appTypeDeclarations = path.join(dir, 'next-env.d.ts')
  if (!fs.existsSync(appTypeDeclarations)) {
    fs.writeFileSync(
      appTypeDeclarations,
      `/// <reference types="next" />${os.EOL}`
    )
  }

  if (toInstall.length > 0) {
    console.warn(
      chalk.red(
        `\n${toInstall.join(' ')} ${
          toInstall.length === 1 ? 'is' : 'are'
        } needed when using TypeScript with Next.js. Please install ${
          toInstall.length === 1 ? 'it' : 'them'
        } with ${
          isYarn ? 'yarn add --dev' : 'npm install --save-dev'
        } ${toInstall.join(' ')}\n`
      )
    )
  }
}
