import findUp from 'next/dist/compiled/find-up'
import path from 'path'
import fs from 'fs'
import type { NextConfig } from '../../server/config-shared'

const EVENT_SWC_PLUGIN_PRESENT = 'NEXT_SWC_PLUGIN_DETECTED'
type SwcPluginsEvent = {
  eventName: string
  payload: {
    pluginName: string
    pluginVersion?: string
  }
}

export async function eventSwcPlugins(
  dir: string,
  config: NextConfig
): Promise<Array<SwcPluginsEvent>> {
  try {
    const packageJsonPath = await findUp('package.json', { cwd: dir })
    if (!packageJsonPath) {
      return []
    }

    const { dependencies = {}, devDependencies = {} } = require(packageJsonPath)

    const deps = { ...devDependencies, ...dependencies }
    const swcPluginPackages =
      config.experimental?.swcPlugins?.map(([name, _]) => name) ?? []

    return swcPluginPackages.map((plugin) => {
      // swc plugins can be non-npm pkgs with absolute path doesn't have version
      const version = deps[plugin] ?? undefined
      let pluginName = plugin
      if (fs.existsSync(pluginName)) {
        pluginName = path.basename(plugin, '.wasm')
      }

      return {
        eventName: EVENT_SWC_PLUGIN_PRESENT,
        payload: {
          pluginName: pluginName,
          pluginVersion: version,
        },
      }
    })
  } catch (_) {
    return []
  }
}
