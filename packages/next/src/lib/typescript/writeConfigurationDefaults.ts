import { promises as fs } from 'fs'
import { bold, cyan, white } from '../picocolors'
import * as CommentJson from 'next/dist/compiled/comment-json'
import semver from 'next/dist/compiled/semver'
import os from 'os'
import type { CompilerOptions } from 'typescript'
import { getTypeScriptConfiguration } from './getTypeScriptConfiguration'
import * as Log from '../../build/output/log'

type DesiredCompilerOptionsShape = {
  [K in keyof CompilerOptions]:
    | { suggested: any; reason?: string }
    | {
        parsedValue?: any
        parsedValues?: Array<any>
        value: any
        reason: string
      }
}

function getDesiredCompilerOptions(
  ts: typeof import('typescript'),
  tsOptions?: CompilerOptions
): DesiredCompilerOptionsShape {
  const o: DesiredCompilerOptionsShape = {
    target: {
      suggested: 'ES2017',
      reason:
        'For top-level `await`. Note: Next.js only polyfills for the esmodules target.',
    },
    // These are suggested values and will be set when not present in the
    // tsconfig.json
    lib: { suggested: ['dom', 'dom.iterable', 'esnext'] },
    allowJs: { suggested: true },
    skipLibCheck: { suggested: true },
    strict: { suggested: false },
    ...(semver.lt(ts.version, '5.0.0')
      ? { forceConsistentCasingInFileNames: { suggested: true } }
      : undefined),
    noEmit: { suggested: true },
    ...(semver.gte(ts.version, '4.4.2')
      ? { incremental: { suggested: true } }
      : undefined),

    // These values are required and cannot be changed by the user
    // Keep this in sync with the webpack config
    // 'parsedValue' matches the output value from ts.parseJsonConfigFileContent()
    module: {
      parsedValue: ts.ModuleKind.ESNext,
      // All of these values work:
      parsedValues: [
        semver.gte(ts.version, '5.4.0') && (ts.ModuleKind as any).Preserve,
        ts.ModuleKind.ES2020,
        ts.ModuleKind.ESNext,
        ts.ModuleKind.CommonJS,
        ts.ModuleKind.AMD,
        ts.ModuleKind.NodeNext,
        ts.ModuleKind.Node16,
      ],
      value: 'esnext',
      reason: 'for dynamic import() support',
    },
    // TODO: Semver check not needed once Next.js repo uses 5.4.
    ...(semver.gte(ts.version, '5.4.0') &&
    tsOptions?.module === (ts.ModuleKind as any).Preserve
      ? {
          // TypeScript 5.4 introduced `Preserve`. Using `Preserve` implies
          // - `moduleResolution` is `Bundler`
          // - `esModuleInterop` is `true`
          // - `resolveJsonModule` is `true`
          // This means that if the user is using Preserve, they don't need these options
        }
      : {
          esModuleInterop: {
            value: true,
            reason: 'requirement for SWC / babel',
          },
          moduleResolution: {
            // In TypeScript 5.0, `NodeJs` has renamed to `Node10`
            parsedValue:
              ts.ModuleResolutionKind.Bundler ??
              ts.ModuleResolutionKind.NodeNext ??
              (ts.ModuleResolutionKind as any).Node10 ??
              ts.ModuleResolutionKind.NodeJs,
            // All of these values work:
            parsedValues: [
              (ts.ModuleResolutionKind as any).Node10 ??
                ts.ModuleResolutionKind.NodeJs,
              // only newer TypeScript versions have this field, it
              // will be filtered for new versions of TypeScript
              (ts.ModuleResolutionKind as any).Node12,
              ts.ModuleResolutionKind.Node16,
              ts.ModuleResolutionKind.NodeNext,
              ts.ModuleResolutionKind.Bundler,
            ].filter((val) => typeof val !== 'undefined'),
            value: 'node',
            reason: 'to match webpack resolution',
          },
          resolveJsonModule: {
            value: true,
            reason: 'to match webpack resolution',
          },
        }),
    ...(tsOptions?.verbatimModuleSyntax === true
      ? undefined
      : {
          isolatedModules: {
            value: true,
            reason: 'requirement for SWC / Babel',
          },
        }),
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
  isFirstTimeSetup: boolean,
  hasAppDir: boolean,
  distDir: string,
  hasPagesDir: boolean
): Promise<void> {
  if (isFirstTimeSetup) {
    await fs.writeFile(tsConfigPath, '{}' + os.EOL)
  }

  const { options: tsOptions, raw: rawConfig } =
    await getTypeScriptConfiguration(ts, tsConfigPath, true)

  const userTsConfigContent = await fs.readFile(tsConfigPath, {
    encoding: 'utf8',
  })
  const userTsConfig = CommentJson.parse(userTsConfigContent)
  if (userTsConfig.compilerOptions == null && !('extends' in rawConfig)) {
    userTsConfig.compilerOptions = {}
    isFirstTimeSetup = true
  }

  const desiredCompilerOptions = getDesiredCompilerOptions(ts, tsOptions)

  const suggestedActions: string[] = []
  const requiredActions: string[] = []
  for (const optionKey of Object.keys(desiredCompilerOptions)) {
    const check = desiredCompilerOptions[optionKey]
    if ('suggested' in check) {
      if (!(optionKey in tsOptions)) {
        if (!userTsConfig.compilerOptions) {
          userTsConfig.compilerOptions = {}
        }
        userTsConfig.compilerOptions[optionKey] = check.suggested
        suggestedActions.push(
          cyan(optionKey) +
            ' was set to ' +
            bold(check.suggested) +
            (check.reason ? ` (${check.reason})` : '')
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
        if (!userTsConfig.compilerOptions) {
          userTsConfig.compilerOptions = {}
        }
        userTsConfig.compilerOptions[optionKey] = check.value
        requiredActions.push(
          cyan(optionKey) +
            ' was set to ' +
            bold(check.value) +
            ` (${check.reason})`
        )
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _: never = check
    }
  }

  const nextAppTypes = `${distDir}/types/**/*.ts`

  if (!('include' in rawConfig)) {
    userTsConfig.include = hasAppDir
      ? ['next-env.d.ts', nextAppTypes, '**/*.ts', '**/*.tsx']
      : ['next-env.d.ts', '**/*.ts', '**/*.tsx']
    suggestedActions.push(
      cyan('include') +
        ' was set to ' +
        bold(
          hasAppDir
            ? `['next-env.d.ts', '${nextAppTypes}', '**/*.ts', '**/*.tsx']`
            : `['next-env.d.ts', '**/*.ts', '**/*.tsx']`
        )
    )
  } else if (hasAppDir && !rawConfig.include.includes(nextAppTypes)) {
    if (!Array.isArray(userTsConfig.include)) {
      userTsConfig.include = []
    }
    // rawConfig will resolve all extends and include paths (ex: tsconfig.json, tsconfig.base.json, etc.)
    // if it doesn't match userTsConfig then update the userTsConfig to add the
    // rawConfig's includes in addition to nextAppTypes
    if (
      rawConfig.include.length !== userTsConfig.include.length ||
      JSON.stringify(rawConfig.include.sort()) !==
        JSON.stringify(userTsConfig.include.sort())
    ) {
      userTsConfig.include.push(...rawConfig.include, nextAppTypes)
      suggestedActions.push(
        cyan('include') +
          ' was set to ' +
          bold(
            `[${[...rawConfig.include, nextAppTypes]
              .map((i) => `'${i}'`)
              .join(', ')}]`
          )
      )
    } else {
      userTsConfig.include.push(nextAppTypes)
      suggestedActions.push(
        cyan('include') + ' was updated to add ' + bold(`'${nextAppTypes}'`)
      )
    }
  }

  // Enable the Next.js typescript plugin.
  if (hasAppDir) {
    // Check if the config or the resolved config has the plugin already.
    const plugins = [
      ...(Array.isArray(tsOptions.plugins) ? tsOptions.plugins : []),
      ...(userTsConfig.compilerOptions &&
      Array.isArray(userTsConfig.compilerOptions.plugins)
        ? userTsConfig.compilerOptions.plugins
        : []),
    ]
    const hasNextPlugin = plugins.some(
      ({ name }: { name: string }) => name === 'next'
    )

    // If the TS config extends on another config, we can't add the `plugin` field
    // because that will override the parent config's plugins.
    // Instead we have to show a message to the user to add the plugin manually.
    if (
      !userTsConfig.compilerOptions ||
      (plugins.length &&
        !hasNextPlugin &&
        'extends' in rawConfig &&
        (!rawConfig.compilerOptions || !rawConfig.compilerOptions.plugins))
    ) {
      Log.info(
        `\nYour ${bold(
          'tsconfig.json'
        )} extends another configuration, which means we cannot add the Next.js TypeScript plugin automatically. To improve your development experience, we recommend adding the Next.js plugin (\`${cyan(
          '"plugins": [{ "name": "next" }]'
        )}\`) manually to your TypeScript configuration. Learn more: https://nextjs.org/docs/app/api-reference/config/typescript#the-typescript-plugin\n`
      )
    } else if (!hasNextPlugin) {
      if (!('plugins' in userTsConfig.compilerOptions)) {
        userTsConfig.compilerOptions.plugins = []
      }
      userTsConfig.compilerOptions.plugins.push({ name: 'next' })
      suggestedActions.push(
        cyan('plugins') + ' was updated to add ' + bold(`{ name: 'next' }`)
      )
    }

    // If `strict` is set to `false` and `strictNullChecks` is set to `false`,
    // then set `strictNullChecks` to `true`.
    if (
      hasPagesDir &&
      hasAppDir &&
      !tsOptions.strict &&
      !('strictNullChecks' in tsOptions)
    ) {
      userTsConfig.compilerOptions.strictNullChecks = true
      suggestedActions.push(
        cyan('strictNullChecks') + ' was set to ' + bold(`true`)
      )
    }
  }

  if (!('exclude' in rawConfig)) {
    userTsConfig.exclude = ['node_modules']
    suggestedActions.push(
      cyan('exclude') + ' was set to ' + bold(`['node_modules']`)
    )
  }

  // During local development inside Next.js repo, exclude the test files coverage by the local tsconfig
  if (process.env.NEXT_PRIVATE_LOCAL_DEV && userTsConfig.exclude) {
    const tsGlob = '**/*.test.ts'
    const tsxGlob = '**/*.test.tsx'
    let hasUpdates = false
    if (!userTsConfig.exclude.includes(tsGlob)) {
      userTsConfig.exclude.push(tsGlob)
      hasUpdates = true
    }
    if (!userTsConfig.exclude.includes(tsxGlob)) {
      userTsConfig.exclude.push(tsxGlob)
      hasUpdates = true
    }

    if (hasUpdates) {
      requiredActions.push(
        'Local development only: Excluded test files from coverage'
      )
    }
  }

  if (suggestedActions.length < 1 && requiredActions.length < 1) {
    return
  }

  if (process.env.NEXT_PRIVATE_LOCAL_DEV) {
    // remove it from the required actions if it exists
    if (
      requiredActions[requiredActions.length - 1].includes(
        'Local development only'
      )
    ) {
      requiredActions.pop()
    }
  }

  await fs.writeFile(
    tsConfigPath,
    CommentJson.stringify(userTsConfig, null, 2) + os.EOL
  )

  Log.info('')
  if (isFirstTimeSetup) {
    Log.info(
      `We detected TypeScript in your project and created a ${cyan(
        'tsconfig.json'
      )} file for you.`
    )
    return
  }

  Log.info(
    `We detected TypeScript in your project and reconfigured your ${cyan(
      'tsconfig.json'
    )} file for you.${
      userTsConfig.compilerOptions?.strict
        ? ''
        : ` Strict-mode is set to ${cyan('false')} by default.`
    }`
  )

  if (suggestedActions.length) {
    Log.info(
      `The following suggested values were added to your ${cyan(
        'tsconfig.json'
      )}. These values ${cyan('can be changed')} to fit your project's needs:\n`
    )

    suggestedActions.forEach((action) => Log.info(`\t- ${action}`))

    Log.info('')
  }

  if (requiredActions.length) {
    Log.info(
      `The following ${white('mandatory changes')} were made to your ${cyan(
        'tsconfig.json'
      )}:\n`
    )

    requiredActions.forEach((action) => Log.info(`\t- ${action}`))

    Log.info('')
  }
}
