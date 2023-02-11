// Copied from ts-jest: https://github.com/kulshekhar/ts-jest/blob/5a0880add0da8d71900eee20c7642e6be65f6a66/src/config/paths-to-module-name-mapper.ts

// we don't need to escape all chars, so commented out is the real one
// const escapeRegex = (str: string) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
const escapeRegex = (str: string) => str.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')

export const pathsToModuleNameMapper = (
  mapping: Record<string, string[]>,
  {
    prefix = '',
    useESM = false,
    logger,
  }: {
    prefix?: string
    useESM?: boolean
    logger?: {
      warn: (...args: any[]) => void
    }
  } = {}
) => {
  const jestMap: Record<string, string | string[]> = {}
  for (const fromPath of Object.keys(mapping)) {
    const toPaths = mapping[fromPath]
    // check that we have only one target path
    if (toPaths.length === 0) {
      logger?.warn(
        `[next/jest]: Not mapping "${fromPath}" because it has no target.`
      )
      continue
    }

    // split with '*'
    const segments = fromPath.split(/\*/g)
    if (segments.length === 1) {
      const paths = toPaths.map((target) => {
        const enrichedPrefix =
          prefix !== '' && !prefix.endsWith('/') ? `${prefix}/` : prefix

        return `${enrichedPrefix}${target}`
      })
      const cjsPattern = `^${escapeRegex(fromPath)}$`
      jestMap[cjsPattern] = paths.length === 1 ? paths[0] : paths
    } else if (segments.length === 2) {
      const paths = toPaths.map((target) => {
        const enrichedTarget =
          target.startsWith('./') && prefix !== ''
            ? target.substring(target.indexOf('/') + 1)
            : target
        const enrichedPrefix =
          prefix !== '' && !prefix.endsWith('/') ? `${prefix}/` : prefix

        return `${enrichedPrefix}${enrichedTarget.replace(/\*/g, '$1')}`
      })
      if (useESM) {
        const esmPattern = `^${escapeRegex(segments[0])}(.*)${escapeRegex(
          segments[1]
        )}\\.js$`
        jestMap[esmPattern] = paths.length === 1 ? paths[0] : paths
      }
      const cjsPattern = `^${escapeRegex(segments[0])}(.*)${escapeRegex(
        segments[1]
      )}$`
      jestMap[cjsPattern] = paths.length === 1 ? paths[0] : paths
    } else {
      logger?.warn(
        `[next/jest]: Not mapping "${fromPath}" because it has more than one star ('*').`
      )
    }
  }

  if (useESM) {
    jestMap['^(\\.{1,2}/.*)\\.js$'] = '$1'
  }

  return jestMap
}
