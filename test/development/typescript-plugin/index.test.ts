import tsNextPluginFactory from 'next'
import ts from 'typescript'
import { resolve } from 'node:path'

const rootDir = resolve(__dirname, '..', '..', '..')
const { name } = require(resolve(rootDir, 'package.json'))
if (name !== 'nextjs-project') {
  throw new Error(
    'This script must be run from the root of the Next.js project'
  )
}

const compilerOptions = ts.getDefaultCompilerOptions()

const files = ts.sys.readDirectory(resolve(__dirname, 'app'))

const compilerHost = ts.createCompilerHost(compilerOptions)
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
const plugin: ts.server.PluginModule = (
  tsNextPluginFactory as unknown as ts.server.PluginModuleFactory
)({ typescript: ts })

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation()
})

const pluginCreateInfo: ts.server.PluginCreateInfo = {
  project: {
    projectService: {
      logger: {
        info: console.log,
      },
    },
    getCurrentDirectory: () => __dirname,
  } as unknown as ts.server.Project,
  languageService,
  languageServiceHost,
  serverHost: null,
  config: {},
}
const pluginLanguageService = plugin.create(pluginCreateInfo)
const pagePath = resolve(__dirname, 'app/metadata/client/page.tsx')
console.log({ pagePath })
const semanticDiagnostics =
  pluginLanguageService.getSemanticDiagnostics(pagePath)
console.log(semanticDiagnostics)
