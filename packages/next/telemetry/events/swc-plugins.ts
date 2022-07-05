import findUp from 'next/dist/compiled/find-up'
import type { NextConfig } from '../../server/config-shared'

const EVENT_SWC_PLUGIN_PRESENT = 'NEXT_SWC_PLUGIN_DETECTED'
type SwcPluginsEvent = {
  eventName: string
  payload: {
    packageName: string
    packageVersion?: string
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

    return swcPluginPackages.reduce(
      (events: SwcPluginsEvent[], plugin: string): SwcPluginsEvent[] => {
        // swc plugins can be non-npm pkgs with absolute path doesn't have version
        const version = deps[plugin] ?? undefined

        events.push({
          eventName: EVENT_SWC_PLUGIN_PRESENT,
          payload: {
            packageName: plugin,
            packageVersion: version,
          },
        })

        return events
      },
      []
    )
  } catch (_) {
    return []
  }
}
