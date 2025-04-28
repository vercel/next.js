import tsNextPluginFactory from 'next'
import ts from 'typescript'
export { NEXT_TS_ERRORS } from 'next/dist/server/typescript/constant'

export type PluginLanguageService = ts.LanguageService & {
  getCapturedLogs: () => string
}

export function getPluginLanguageService(dir: string): PluginLanguageService {
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

export function getTsFiles(dir: string): string[] {
  return ts.sys.readDirectory(dir)
}
