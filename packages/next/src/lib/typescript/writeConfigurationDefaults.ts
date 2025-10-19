import { readFileSync, writeFileSync } from 'fs'
import { bold, cyan, white } from '../picocolors'
import * as CommentJson from 'next/dist/compiled/comment-json'
import semver from 'next/dist/compiled/semver'
import os from 'os'
import type { CompilerOptions } from 'typescript'
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
  typescriptVersion: string,
  userTsConfig?: Record<string, any>
): DesiredCompilerOptionsShape {
  // ModuleKind
  const moduleKindESNext = 'esnext'
  const moduleKindES2020 = 'es2020'
  const moduleKindPreserve = 'preserve'
  const moduleKindNodeNext = 'nodenext'
  const moduleKindNode16 = 'node16'
  const moduleKindCommonJS = 'commonjs'
  const moduleKindAMD = 'amd'

  // ModuleResolutionKind
  const moduleResolutionKindBundler = 'bundler'
  const moduleResolutionKindNode10 = 'node10'
  const moduleResolutionKindNode12 = 'node12'
  const moduleResolutionKindNodeJs = 'node'

  // Jsx
  const jsxEmitReactJSX = 'react-jsx'

  return {
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
    noEmit: { suggested: true },
    incremental: { suggested: true },

    // These values are required and cannot be changed by the user
    // Keep this in sync with the webpack config
    // 'parsedValue' matches the output value from ts.parseJsonConfigFileContent()
    module: {
      parsedValue: moduleKindESNext,
      // All of these values work:
      parsedValues: [
        semver.gte(typescriptVersion, '5.4.0') && moduleKindPreserve,
        moduleKindES2020,
        moduleKindESNext,
        moduleKindCommonJS,
        moduleKindAMD,
        moduleKindNodeNext,
        moduleKindNode16,
      ],
      value: 'esnext',
      reason: 'for dynamic import() support',
    },
    // TODO: Semver check not needed once Next.js repo uses 5.4.
    ...(semver.gte(typescriptVersion, '5.4.0') &&
    userTsConfig?.compilerOptions?.module?.toLowerCase() === moduleKindPreserve
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
            parsedValue: moduleResolutionKindBundler,
            // All of these values work:
            parsedValues: [
              moduleResolutionKindNode10,
              moduleResolutionKindNodeJs,
              // only newer TypeScript versions have this field, it
              // will be filtered for new versions of TypeScript
              moduleResolutionKindNode12,
              moduleKindNode16,
              moduleKindNodeNext,
              moduleResolutionKindBundler,
            ].filter((val) => typeof val !== 'undefined'),
            value: 'node',
            reason: 'to match webpack resolution',
          },
          resolveJsonModule: {
            value: true,
            reason: 'to match webpack resolution',
          },
        }),
    ...(userTsConfig?.compilerOptions?.verbatimModuleSyntax === true
      ? undefined
      : {
          isolatedModules: {
            value: true,
            reason: 'requirement for SWC / Babel',
          },
        }),
    jsx: {
      parsedValue: jsxEmitReactJSX,
      value: 'react-jsx',
      reason: 'next.js uses the React automatic runtime',
    },
  } satisfies DesiredCompilerOptionsShape
}

export function getRequiredConfiguration(
  typescript: typeof import('typescript')
): Partial<import('typescript').CompilerOptions> {
  const res: Partial<import('typescript').CompilerOptions> = {}
  const typescriptVersion = typescript.version

  const desiredCompilerOptions = getDesiredCompilerOptions(typescriptVersion)
  for (const optionKey of Object.keys(desiredCompilerOptions)) {
    const ev = desiredCompilerOptions[optionKey]
    if (!('value' in ev)) {
      continue
    }

    const value = ev.parsedValue ?? ev.value

    // Convert string values back to TypeScript enum values
    if (optionKey === 'module' && typeof value === 'string') {
      const moduleMap: Record<string, import('typescript').ModuleKind> = {
        esnext: typescript.ModuleKind.ESNext,
        es2020: typescript.ModuleKind.ES2020,
        ...(typescript.ModuleKind.Preserve !== undefined
          ? { preserve: typescript.ModuleKind.Preserve }
          : {}),
        nodenext: typescript.ModuleKind.NodeNext,
        node16: typescript.ModuleKind.Node16,
        commonjs: typescript.ModuleKind.CommonJS,
        amd: typescript.ModuleKind.AMD,
      }
      res[optionKey] = moduleMap[value.toLowerCase()] ?? value
    } else if (optionKey === 'moduleResolution' && typeof value === 'string') {
      const moduleResolutionMap: Record<
        string,
        import('typescript').ModuleResolutionKind
      > = {
        bundler: typescript.ModuleResolutionKind.Bundler,
        node10: typescript.ModuleResolutionKind.Node10,
        node12: (typescript.ModuleResolutionKind as any).Node12,
        node: typescript.ModuleResolutionKind.NodeJs,
      }
      res[optionKey] = moduleResolutionMap[value.toLowerCase()] ?? value
    } else if (optionKey === 'jsx' && typeof value === 'string') {
      const jsxMap: Record<string, import('typescript').JsxEmit> = {
        'react-jsx': typescript.JsxEmit.ReactJSX,
      }
      res[optionKey] = jsxMap[value.toLowerCase()] ?? value
    } else {
      res[optionKey] = value
    }
  }

  return res
}

const localDevTestFilesExcludeAction =
  'NEXT_PRIVATE_LOCAL_DEV_TEST_FILES_EXCLUDE'

export async function writeConfigurationDefaults(
  typescriptVersion: string,
  tsConfigPath: string,
  isFirstTimeSetup: boolean,
  hasAppDir: boolean,
  distDir: string,
  hasPagesDir: boolean,
  isolatedDevBuild: boolean | undefined
): Promise<void> {
  if (isFirstTimeSetup) {
    writeFileSync(tsConfigPath, '{}' + os.EOL)
  }

  const userTsConfigContent = readFileSync(tsConfigPath, {
    encoding: 'utf8',
  })
  const userTsConfig = CommentJson.parse(userTsConfigContent)

  // Bail automatic setup when the user has extended or referenced another config
  if ('extends' in userTsConfig || 'references' in userTsConfig) {
    return
  }

  if (userTsConfig?.compilerOptions == null) {
    userTsConfig.compilerOptions = {}
    isFirstTimeSetup = true
  }

  const desiredCompilerOptions = getDesiredCompilerOptions(
    typescriptVersion,
    userTsConfig
  )

  const suggestedActions: string[] = []
  const requiredActions: string[] = []
  for (const optionKey in desiredCompilerOptions) {
    const check = desiredCompilerOptions[optionKey]
    if ('suggested' in check) {
      if (!(optionKey in userTsConfig?.compilerOptions)) {
        userTsConfig.compilerOptions[optionKey] = check.suggested
        suggestedActions.push(
          cyan(optionKey) +
            ' was set to ' +
            bold(check.suggested) +
            (check.reason ? ` (${check.reason})` : '')
        )
      }
    } else if ('value' in check) {
      let existingValue = userTsConfig?.compilerOptions?.[optionKey]

      if (typeof existingValue === 'string') {
        existingValue = existingValue.toLowerCase()
      }

      const shouldWriteRequiredValue = () => {
        // Check if the option has multiple allowed values
        if (check.parsedValues) {
          return !check.parsedValues.includes(existingValue)
        }

        // Check if the option has a single parsed value
        if (check.parsedValue) {
          return check.parsedValue !== existingValue
        }

        // Fall back to direct value comparison
        return check.value !== existingValue
      }

      if (shouldWriteRequiredValue()) {
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
      const _: never = check
    }
  }

  const nextAppTypes: string[] = [`${distDir}/types/**/*.ts`]

  // When isolatedDevBuild is enabled, Next.js uses different distDir paths:
  // - Development: "{distDir}/dev"
  // - Production: "{distDir}"
  // To prevent tsconfig updates when switching between dev/build modes,
  // we proactively include both type paths regardless of current environment.
  if (isolatedDevBuild !== false) {
    nextAppTypes.push(
      process.env.NODE_ENV === 'development'
        ? // In dev, distDir is "{distDir}/dev", which is already in the array above, but we also need "{distDir}/types".
          // Here we remove "/dev" at the end of distDir for consistency.
          `${distDir.replace(/\/dev$/, '')}/types/**/*.ts`
        : // In build, distDir is "{distDir}", which is already in the array above, but we also need "{distDir}/dev/types".
          // Here we add "/dev" at the end of distDir for consistency.
          `${distDir}/dev/types/**/*.ts`
    )
    // Sort the array to ensure consistent order.
    nextAppTypes.sort((a, b) => a.length - b.length)
  }

  if (!('include' in userTsConfig)) {
    userTsConfig.include = hasAppDir
      ? ['next-env.d.ts', ...nextAppTypes, '**/*.mts', '**/*.ts', '**/*.tsx']
      : ['next-env.d.ts', '**/*.mts', '**/*.ts', '**/*.tsx']
    suggestedActions.push(
      cyan('include') +
        ' was set to ' +
        bold(
          hasAppDir
            ? `['next-env.d.ts', ${nextAppTypes.map((type) => `'${type}'`).join(', ')}, '**/*.mts', '**/*.ts', '**/*.tsx']`
            : `['next-env.d.ts', '**/*.mts', '**/*.ts', '**/*.tsx']`
        )
    )
  } else if (hasAppDir) {
    const missingFromResolved = []
    for (const type of nextAppTypes) {
      if (!userTsConfig.include.includes(type)) {
        missingFromResolved.push(type)
      }
    }

    if (missingFromResolved.length > 0) {
      if (!Array.isArray(userTsConfig.include)) {
        userTsConfig.include = []
      }

      missingFromResolved.forEach((item) => {
        userTsConfig.include.push(item)
        suggestedActions.push(
          cyan('include') + ' was updated to add ' + bold(`'${item}'`)
        )
      })
    }
  }

  // Enable the Next.js typescript plugin.
  if (hasAppDir) {
    // Check if the config or the resolved config has the plugin already.
    const plugins = [
      ...(Array.isArray(userTsConfig?.plugins) ? userTsConfig.plugins : []),
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
        'extends' in userTsConfig &&
        (!userTsConfig.compilerOptions ||
          !userTsConfig.compilerOptions.plugins))
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
      !userTsConfig?.compilerOptions?.strict &&
      !('strictNullChecks' in userTsConfig?.compilerOptions)
    ) {
      userTsConfig.compilerOptions.strictNullChecks = true
      suggestedActions.push(
        cyan('strictNullChecks') + ' was set to ' + bold(`true`)
      )
    }
  }

  if (!('exclude' in userTsConfig)) {
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
      requiredActions.push(localDevTestFilesExcludeAction)
    }
  }

  if (suggestedActions.length < 1 && requiredActions.length < 1) {
    return
  }

  writeFileSync(
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

  const requiredActionsToBeLogged = process.env.NEXT_PRIVATE_LOCAL_DEV
    ? requiredActions.filter(
        (action) => action !== localDevTestFilesExcludeAction
      )
    : requiredActions

  if (requiredActionsToBeLogged.length) {
    Log.info(
      `The following ${white('mandatory changes')} were made to your ${cyan(
        'tsconfig.json'
      )}:\n`
    )

    requiredActionsToBeLogged.forEach((action) => Log.info(`\t- ${action}`))

    Log.info('')
  }
}
