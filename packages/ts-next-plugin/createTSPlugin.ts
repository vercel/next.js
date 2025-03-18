import ts from 'typescript'
import { TSNextPlugin } from './TSNextPlugin'
import { createProxy } from './proxy'

export const createTSPlugin: ts.server.PluginModuleFactory = () => {
  function create(info: ts.server.PluginCreateInfo) {
    const tsNextPlugin = new TSNextPlugin(info)

    const virtualFiles: Record<
      string,
      { scriptSnapshot: ts.IScriptSnapshot; ver: number }
    > = {}

    const getScriptVersion = info.languageServiceHost.getScriptVersion.bind(
      info.languageServiceHost
    )
    info.languageServiceHost.getScriptVersion = (fileName: string) => {
      tsNextPlugin.log(`[ProxiedLSHost] getScriptVersion(${fileName})`)
      const file = virtualFiles[fileName]
      if (!file) return getScriptVersion(fileName)
      tsNextPlugin.log(
        `[ProxiedLSHost] getScriptVersion(${fileName}) - ${file.ver}`
      )
      return file.ver.toString()
    }

    const getScriptSnapshot = info.languageServiceHost.getScriptSnapshot.bind(
      info.languageServiceHost
    )
    info.languageServiceHost.getScriptSnapshot = (fileName: string) => {
      tsNextPlugin.log(`[ProxiedLSHost] getScriptSnapshot(${fileName})`)
      const file = virtualFiles[fileName]
      if (!file) return getScriptSnapshot(fileName)
      tsNextPlugin.log(
        `[ProxiedLSHost] getScriptSnapshot(${fileName}) - ${JSON.stringify(file.scriptSnapshot, null, 2)}`
      )
      return file.scriptSnapshot
    }

    const getScriptFileNames = info.languageServiceHost.getScriptFileNames.bind(
      info.languageServiceHost
    )
    info.languageServiceHost.getScriptFileNames = () => {
      const names: Set<string> = new Set()
      for (var name in virtualFiles) {
        if (virtualFiles.hasOwnProperty(name)) {
          names.add(name)
        }
      }
      const files = getScriptFileNames()
      for (const file of files) {
        names.add(file)
      }
      tsNextPlugin.log(
        `[ProxiedLSHost] getScriptFileNames() - ${JSON.stringify([...names], null, 2)}`
      )
      return [...names]
    }

    const readFile = info.languageServiceHost.readFile.bind(
      info.languageServiceHost
    )
    info.languageServiceHost.readFile = (fileName: string) => {
      tsNextPlugin.log(`[ProxiedLSHost] readFile(${fileName})`)
      const file = virtualFiles[fileName]
      return file
        ? file.scriptSnapshot.getText(0, file.scriptSnapshot.getLength())
        : readFile(fileName)
    }

    const fileExists = info.languageServiceHost.fileExists.bind(
      info.languageServiceHost
    )
    info.languageServiceHost.fileExists = (fileName: string) => {
      tsNextPlugin.log(`[ProxiedLSHost] fileExists(${fileName})`)
      return !!virtualFiles[fileName] || fileExists(fileName)
    }

    // TODO(dimitri question for gadzik): why are we patching the `addFile` api, which doesn't exist in the language service host?
    // const addFile = info.languageServiceHost.addFile.bind(
    //   info.languageServiceHost
    // )
    // @ts-ignore
    info.languageServiceHost.addFile = (fileName: string, body: string) => {
      tsNextPlugin.log(
        `[ProxiedLSHost] addFile(${fileName})\n\n${body}\n<<EOF>>`
      )
      const snap = ts.ScriptSnapshot.fromString(body)
      snap.getChangeRange = (_) => undefined
      const existing = virtualFiles[fileName]
      if (existing) {
        virtualFiles[fileName].ver++
        virtualFiles[fileName].scriptSnapshot = snap
      } else {
        virtualFiles[fileName] = { ver: 2, scriptSnapshot: snap }
      }

      // This is the same function call that the Svelte TS plugin makes
      // @ts-expect-error internal API since TS 5.5
      info.project.markAsDirty?.()
      // return addFile(fileName, body) // see TODO above
    }

    return createProxy(tsNextPlugin)
  }

  return { create }
}
