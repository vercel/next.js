export function deepMerge(target: any, source: any) {
  const result = { ...target, ...source }
  for (const key of Object.keys(result)) {
    result[key] = Array.isArray(target[key])
      ? (target[key] = [...target[key], ...(source[key] || [])])
      : typeof target[key] == 'object' && typeof source[key] == 'object'
      ? deepMerge(target[key], source[key])
      : result[key]
  }
  return result
}
