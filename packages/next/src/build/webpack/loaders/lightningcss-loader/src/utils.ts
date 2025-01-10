let targetsCache: Record<string, any> = {}

/**
 * Convert a version number to a single 24-bit number
 *
 * https://github.com/lumeland/lume/blob/4cc75599006df423a14befc06d3ed8493c645b09/plugins/lightningcss.ts#L160
 */
function version(major: number, minor = 0, patch = 0): number {
  return (major << 16) | (minor << 8) | patch
}

function parseVersion(v: string) {
  return v.split('.').reduce(
    (acc, val) => {
      if (!acc) {
        return null
      }

      const parsed = parseInt(val, 10)
      if (isNaN(parsed)) {
        return null
      }
      acc.push(parsed)
      return acc
    },
    [] as Array<number> | null
  )
}

function browserslistToTargets(targets: Array<string>) {
  return targets.reduce(
    (acc, value) => {
      const [name, v] = value.split(' ')
      const parsedVersion = parseVersion(v)

      if (!parsedVersion) {
        return acc
      }
      const versionDigit = version(
        parsedVersion[0],
        parsedVersion[1],
        parsedVersion[2]
      )

      if (
        name === 'and_qq' ||
        name === 'and_uc' ||
        name === 'baidu' ||
        name === 'bb' ||
        name === 'kaios' ||
        name === 'op_mini'
      ) {
        return acc
      }

      if (acc[name] == null || versionDigit < acc[name]) {
        acc[name] = versionDigit
      }

      return acc
    },
    {} as Record<string, number>
  )
}

export const getTargets = (opts: { targets?: string[]; key: any }) => {
  const cache = targetsCache[opts.key]
  if (cache) {
    return cache
  }

  const result = browserslistToTargets(opts.targets ?? [])
  return (targetsCache[opts.key] = result)
}
