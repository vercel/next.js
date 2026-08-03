import tsNextPluginFactory from 'next'
import ts from 'typescript'
export { NEXT_TS_ERRORS } from 'next/dist/server/typescript/constant'

export type PluginLanguageService = ts.LanguageService & {
  getCapturedLogs: () => string
}

export type QuickInfoAtPositionArgs = [
  fileName: string,
  position: number,
  maximumLength?: number,
  verbosityLevel?: number,
]

type RuntimeQuickInfoAtPosition = (
  ...args: QuickInfoAtPositionArgs
) => ts.QuickInfo | undefined

export type QuickInfoTestAdapter = {
  languageService: PluginLanguageService
  getQuickInfoAtPosition: RuntimeQuickInfoAtPosition
  getCapturedQuickInfoArgs: () => QuickInfoAtPositionArgs | undefined
}

type QuickInfoInterceptor = {
  capture: (args: QuickInfoAtPositionArgs) => void
  transform: (
    quickInfo: ts.QuickInfo | undefined,
    args: QuickInfoAtPositionArgs
  ) => ts.QuickInfo | undefined
}

function createPluginLanguageService(
  dir: string,
  quickInfoInterceptor?: QuickInfoInterceptor
): PluginLanguageService {
  const files = ts.sys.readDirectory(dir)

  const compilerOptions = ts.getDefaultCompilerOptions()
  const compilerHost = ts.createCompilerHost(compilerOptions)

  let logs = ''
  const logger = {
    info: (...args: any[]) => {
      const message = args
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join(' ')
      logs += message + '\n'
      console.log(...args)
    },
  }

  const languageServiceHost: ts.LanguageServiceHost = {
    ...compilerHost,
    getCompilationSettings: () => compilerOptions,
    getScriptFileNames: () => files,
    getScriptSnapshot: (fileName) => {
      const contents = ts.sys.readFile(fileName)
      if (contents && typeof contents === 'string') {
        return ts.ScriptSnapshot.fromString(contents)
      }
      return
    },
    getScriptVersion: () => '0',
    writeFile: ts.sys.writeFile,
  }

  const languageService = ts.createLanguageService(languageServiceHost)

  if (quickInfoInterceptor) {
    const getQuickInfoAtPosition = languageService.getQuickInfoAtPosition.bind(
      languageService
    ) as RuntimeQuickInfoAtPosition

    languageService.getQuickInfoAtPosition = ((...args) => {
      quickInfoInterceptor.capture(args)
      const quickInfo = getQuickInfoAtPosition(...args)
      return quickInfoInterceptor.transform(quickInfo, args)
    }) as ts.LanguageService['getQuickInfoAtPosition']
  }

  const pluginCreateInfo: ts.server.PluginCreateInfo = {
    project: {
      projectService: {
        logger,
      },
      getCurrentDirectory: () => dir,
    } as unknown as ts.server.Project,
    languageService,
    languageServiceHost,
    serverHost: null,
    config: {},
  }

  const plugin: ts.server.PluginModule = (
    tsNextPluginFactory as unknown as ts.server.PluginModuleFactory
  )({ typescript: ts })

  const service = plugin.create(pluginCreateInfo) as PluginLanguageService

  // Add a custom method to get captured logs
  service.getCapturedLogs = () => logs

  return service
}

export function getPluginLanguageService(dir: string): PluginLanguageService {
  return createPluginLanguageService(dir)
}

export function getQuickInfoTestAdapter(
  dir: string,
  transform: QuickInfoInterceptor['transform']
): QuickInfoTestAdapter {
  let capturedQuickInfoArgs: QuickInfoAtPositionArgs | undefined
  const languageService = createPluginLanguageService(dir, {
    capture: (args) => {
      capturedQuickInfoArgs = [...args]
    },
    transform,
  })

  const getQuickInfoAtPosition = languageService.getQuickInfoAtPosition.bind(
    languageService
  ) as RuntimeQuickInfoAtPosition

  return {
    languageService,
    getQuickInfoAtPosition,
    getCapturedQuickInfoArgs: () => capturedQuickInfoArgs,
  }
}

export function getTsFiles(dir: string): string[] {
  return ts.sys.readDirectory(dir)
}
