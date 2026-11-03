/** Explicit file-worker debugging; coordinator arguments never propagate. */
export function parseTestInspectAddress(value: unknown): string | undefined {
  if (value === 'true' || value === 'yes') value = true
  else if (value === 'false' || value === 'no') value = false
  if (value === undefined || value === false) return undefined
  if (value === true) return '127.0.0.1:9229'
  const match =
    typeof value === 'string'
      ? /^(?:(\[[^\]\s]+\]|[^:\s]+):)?(\d+)$/.exec(value)
      : null
  if (!match)
    throw new Error('inspect must be [host:]port with a port from 0 to 65535.')
  const port = Number(match[2])
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535)
    throw new Error('inspect must be [host:]port with a port from 0 to 65535.')
  return `${match[1] || '127.0.0.1'}:${port}`
}

/** The pinned break flag treats zero as its default port, rather than ephemeral. */
export function parseTestInspectBrkAddress(value: unknown): string | undefined {
  if (value === 'true' || value === 'yes') value = true
  else if (value === 'false' || value === 'no') value = false
  return parseTestInspectAddress(value)?.replace(/:0$/, ':9229')
}

/** Config strings follow the pinned host[:port] shape, unlike CLI port strings. */
export function parseConfiguredTestInspectAddress(
  value: boolean | string | undefined
): string | undefined {
  if (value === undefined || value === false || value === '') return undefined
  if (value === true) return '127.0.0.1:9229'
  if (/https?:\//.test(value))
    throw new Error(
      `Inspector host cannot be a URL. Use "host:port" instead of "${value}"`
    )
  const [host, port] = value.split(':')
  return parseTestInspectAddress(
    `${host || '127.0.0.1'}:${port ? Number(port) || 9229 : 9229}`
  )
}
