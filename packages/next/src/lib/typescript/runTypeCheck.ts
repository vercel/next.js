import path from 'path'
import { getFormattedDiagnostic } from './diagnosticFormatter'
import { getTypeScriptConfiguration } from './getTypeScriptConfiguration'
import { getRequiredConfiguration } from './writeConfigurationDefaults'
import { getDevTypesPath } from './type-paths'
import {
  filterTypeScriptFiles,
  type TypeCheckDirs,
  type DebugBuildPaths,
} from './filterTypeScriptFiles'

export type { TypeCheckDirs, DebugBuildPaths } from './filterTypeScriptFiles'

import { CompileError } from '../compile-error'
import { warn } from '../../build/output/log'

export interface TypeCheckResult {
  inputFilesCount?: number
  totalFilesCount?: number
  incremental: boolean
}

export async function runTypeCheck(
  typescript: typeof import('typescript'),
  baseDir: string,
  distDir: string,
  tsConfigPath: string,
  cacheDir?: string,
  isAppDirEnabled?: boolean,
  dirs?: TypeCheckDirs,
  debugBuildPaths?: DebugBuildPaths
): Promise<TypeCheckResult> {
  const effectiveConfiguration = await getTypeScriptConfiguration(
    typescript,
    tsConfigPath
  )

  // tsconfig includes both .next/types and .next/dev/types to avoid config churn
  // between dev/build modes. During build, we filter out .next/dev/types files to
  // prevent stale dev types from causing errors when routes have been deleted since
  // the last dev session.
  let fileNames = effectiveConfiguration.fileNames

  // Get the dev types path to filter (null if not applicable)
  const devTypesDir = getDevTypesPath(baseDir, distDir)
  if (devTypesDir) {
    fileNames = fileNames.filter(
      (fileName) => !fileName.startsWith(devTypesDir)
    )
  }

  // Apply debug build paths filter if specified
  if (dirs && debugBuildPaths) {
    fileNames = filterTypeScriptFiles(fileNames, dirs, debugBuildPaths)
  }

  if (fileNames.length < 1) {
    return {
      inputFilesCount: 0,
      totalFilesCount: 0,
      incremental: false,
    }
  }
  const requiredConfig = getRequiredConfiguration(typescript)

  const options = {
    ...requiredConfig,
    ...effectiveConfiguration.options,
    declarationMap: false,
    emitDeclarationOnly: false,
    noEmit: true,
  }

  let program:
    | import('typescript').Program
    | import('typescript').BuilderProgram
  let incremental = false
  if ((options.incremental || options.composite) && cacheDir) {
    if (options.composite) {
      warn(
        'TypeScript project references are not fully supported. Attempting to build in incremental mode.'
      )
    }
    incremental = true
    program = typescript.createIncrementalProgram({
      rootNames: fileNames,
      options: {
        ...options,
        composite: false,
        incremental: true,
        tsBuildInfoFile: path.join(cacheDir, '.tsbuildinfo'),
      },
    })
  } else {
    program = typescript.createProgram(fileNames, options)
  }

  const result = program.emit()

  const ignoreRegex = [
    // matches **/__(tests|mocks)__/**
    /[\\/]__(?:tests|mocks)__[\\/]/,
    // matches **/*.(spec|test).*
    /(?<=[\\/.])(?:spec|test)\.[^\\/]+$/,
  ]
  const regexIgnoredFile = new RegExp(
    ignoreRegex.map((r) => r.source).join('|')
  )

  const allDiagnostics = typescript
    .getPreEmitDiagnostics(program as import('typescript').Program)
    .concat(result.diagnostics)
    .filter((d) => !(d.file && regexIgnoredFile.test(d.file.fileName)))

  const firstError =
    allDiagnostics.find(
      (d) =>
        d.category === typescript.DiagnosticCategory.Error && Boolean(d.file)
    ) ??
    allDiagnostics.find(
      (d) => d.category === typescript.DiagnosticCategory.Error
    )

  // In test mode, we want to check all diagnostics, not just the first one.
  if (process.env.__NEXT_TEST_MODE) {
    if (firstError) {
      const allErrors = allDiagnostics
        .filter((d) => d.category === typescript.DiagnosticCategory.Error)
        .map(
          (d) =>
            '[Test Mode] ' +
            getFormattedDiagnostic(
              typescript,
              baseDir,
              distDir,
              d,
              isAppDirEnabled
            )
        )

      console.error(
        '\n\n===== TS errors =====\n\n' +
          allErrors.join('\n\n') +
          '\n\n===== TS errors =====\n\n'
      )

      // Make sure all stdout is flushed before we exit.
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  if (firstError) {
    throw new CompileError(
      getFormattedDiagnostic(
        typescript,
        baseDir,
        distDir,
        firstError,
        isAppDirEnabled
      )
    )
  }

  return {
    inputFilesCount: fileNames.length,
    totalFilesCount: program.getSourceFiles().length,
    incremental,
  }
}
