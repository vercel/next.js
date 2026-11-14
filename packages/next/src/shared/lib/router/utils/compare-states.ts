import type { default as Router } from '../router'

function queryValuesEqual(
  a: string | string[] | undefined,
  b: string | string[] | undefined
): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  return false
}

export function compareRouterStates(a: Router['state'], b: Router['state']) {
  const stateKeys = Object.keys(a)
  if (stateKeys.length !== Object.keys(b).length) return false

  for (let i = stateKeys.length; i--; ) {
    const key = stateKeys[i]
    if (key === 'query') {
      const queryKeys = Object.keys(a.query)
      if (queryKeys.length !== Object.keys(b.query).length) {
        return false
      }
      for (let j = queryKeys.length; j--; ) {
        const queryKey = queryKeys[j]
        if (
          !b.query.hasOwnProperty(queryKey) ||
          !queryValuesEqual(a.query[queryKey], b.query[queryKey])
        ) {
          return false
        }
      }
    } else if (
      !b.hasOwnProperty(key) ||
      a[key as keyof Router['state']] !== b[key as keyof Router['state']]
    ) {
      return false
    }
  }

  return true
}
