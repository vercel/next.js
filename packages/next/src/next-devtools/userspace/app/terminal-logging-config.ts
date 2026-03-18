export function getTerminalLoggingConfig():
  | false
  | boolean
  | {
      depthLimit?: number
      edgeLimit?: number
      showSourceLocation?: boolean
    } {
  try {
    return JSON.parse(
      process.env.__NEXT_BROWSER_DEBUG_INFO_IN_TERMINAL || 'false'
    )
  } catch {
    return false
  }
}

export function getIsTerminalLoggingEnabled(): boolean {
  const config = getTerminalLoggingConfig()
  return Boolean(config)
}
