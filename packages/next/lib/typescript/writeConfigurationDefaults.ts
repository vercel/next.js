import { promises as fs } from 'fs'
import chalk from 'chalk'
import * as CommentJson from 'next/dist/compiled/comment-json'
import os from 'os'
import { getTypeScriptConfiguration } from './getTypeScriptConfiguration'

type DesiredCompilerOptionsShape = {
  [key: string]:
    | { suggested: any }
    | {
        parsedValue?: any
        parsedValues?: Array<any>
        value: any
        reason: string
      }
}

function getDesiredCompilerOptions(
  ts: typeof import('typescript')
): DesiredCompilerOptionsShape {
  const o: DesiredCompilerOptionsShape = {
    // These are suggested values and will be set when not present in the
    // tsconfig.json
    target: { suggested: 'es5' },
    lib: { suggested: ['dom', 'dom.iterable', 'esnext'] },
    allowJs: { suggested: true },
    skipLibCheck: { suggested: true },
    strict: { suggested: false },
    forceConsistentCasingInFileNames: { suggested: true },
    noEmit: { suggested: true },

    // These values are required and cannot be changed by the user
    // Keep this in sync with the webpack config
    // 'parsedValue' matches the output value from ts.parseJsonConfigFileContent()
    esModuleInterop: {
      value: true,
      reason: 'requirement for babel',
    },
    module: {
      parsedValue: ts.ModuleKind.ESNext,
      // All of these values work:
      parsedValues: [
        ts.ModuleKind.ES2020,
        ts.ModuleKind.ESNext,
        ts.ModuleKind.CommonJS,
        ts.ModuleKind.AMD,
      ],
      value: 'esnext',
      reason: 'for dynamic import() support',
    },
    moduleResolution: {
      parsedValue: ts.ModuleResolutionKind.NodeJs,
      value: 'node',
      reason: 'to match webpack resolution',
    },
    resolveJsonModule: { value: true, reason: 'to match webpack resolution' },
    isolatedModules: {
      value: true,
      reason: 'requirement for babel',
    },
    jsx: {
      parsedValue: ts.JsxEmit.Preserve,
      value: 'preserve',
      reason: 'next.js implements its own optimized jsx transform',
    },
  }

  return o
}

export function getRequiredConfiguration(
  ts: typeof import('typescript')
): Partial<import('typescript').CompilerOptions> {
  const res: Partial<import('typescript').CompilerOptions> = {}

  const desiredCompilerOptions = getDesiredCompilerOptions(ts)
  for (const optionKey of Object.keys(desiredCompilerOptions)) {
    const ev = desiredCompilerOptions[optionKey]
    if (!('value' in ev)) {
      continue
    }
    res[optionKey] = ev.parsedValue ?? ev.value
  }

  return res
}

export async function writeConfigurationDefaults(
  ts: typeof import('typescript'),
  tsConfigPath: string,
  isFirstTimeSetup: boolean
): Promise<void> {
  if (isFirstTimeSetup) {
    await fs.writeFile(tsConfigPath, '{}' + os.EOL)
  }

  const desiredCompilerOptions = getDesiredCompilerOptions(ts)
  const {
    options: tsOptions,
    raw: rawConfig,
  } = await getTypeScriptConfiguration(ts, tsConfigPath, true)

  const userTsConfigContent = await fs.readFile(tsConfigPath, {
    encoding: 'utf8',
  })
  const userTsConfig = CommentJson.parse(userTsConfigContent)
  if (userTsConfig.compilerOptions == null && !('extends' in rawConfig)) {
    userTsConfig.compilerOptions = {}
    isFirstTimeSetup = true
  }

  const suggestedActions: string[] = []
  const requiredActions: string[] = []
  for (const optionKey of Object.keys(desiredCompilerOptions)) {
    const check = desiredCompilerOptions[optionKey]
    if ('suggested' in check) {
      if (!(optionKey in tsOptions)) {
        userTsConfig.compilerOptions[optionKey] = check.suggested
        suggestedActions.push(
          chalk.cyan(optionKey) + ' was set to ' + chalk.bold(check.suggested)
        )
      }
    } else if ('value' in check) {
      const ev = tsOptions[optionKey]
      if (
        !('parsedValues' in check
          ? check.parsedValues?.includes(ev)
          : 'parsedValue' in check
          ? check.parsedValue === ev
          : check.value === ev)
      ) {
        userTsConfig.compilerOptions[optionKey] = check.value
        requiredActions.push(
          chalk.cyan(optionKey) +
            ' was set to ' +
            chalk.bold(check.value) +
            ` (${check.reason})`
        )
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _: never = check
    }
  }

  if (!('include' in rawConfig)) {
    userTsConfig.include = ['next-env.d.ts', '**/*.ts', '**/*.tsx']
    suggestedActions.push(
      chalk.cyan('include') +
        ' was set to ' +
        chalk.bold(`['next-env.d.ts', '**/*.ts', '**/*.tsx']`)
    )
  }

  if (!('exclude' in rawConfig)) {
    userTsConfig.exclude = ['node_modules']
    suggestedActions.push(
      chalk.cyan('exclude') + ' was set to ' + chalk.bold(`['node_modules']`)
    )
  }

  if (suggestedActions.length < 1 && requiredActions.length < 1) {
    return
  }

  await fs.writeFile(
    tsConfigPath,
    CommentJson.stringify(userTsConfig, null, 2) + os.EOL
  )

  if (isFirstTimeSetup) {
    console.log(
      chalk.green(
        `We detected TypeScript in your project and created a ${chalk.bold(
          'tsconfig.json'
        )} file for you.`
      ) + '\n'
    )
    return
  }

  console.log(
    chalk.green(
      `We detected TypeScript in your project and reconfigured your ${chalk.bold(
        'tsconfig.json'
      )} file for you. Strict-mode is set to ${chalk.bold('false')} by default.`
    ) + '\n'
  )
  if (suggestedActions.length) {
    console.log(
      `The following suggested values were added to your ${chalk.cyan(
        'tsconfig.json'
      )}. These values ${chalk.bold(
        'can be changed'
      )} to fit your project's needs:\n`
    )

    suggestedActions.forEach((action) => console.log(`\t- ${action}`))

    console.log('')
  }

  if (requiredActions.length) {
    console.log(
      `The following ${chalk.bold(
        'mandatory changes'
      )} were made to your ${chalk.cyan('tsconfig.json')}:\n`
    )

    requiredActions.forEach((action) => console.log(`\t- ${action}`))

    console.log('')
  }
}
