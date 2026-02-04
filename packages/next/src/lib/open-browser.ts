import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Normalizes hostname for browser opening.
 * Converts 0.0.0.0 and :: to localhost since browsers can't connect to these addresses.
 */
export function normalizeHostnameForBrowser(hostname?: string): string {
  if (!hostname || hostname === '0.0.0.0' || hostname === '::') {
    return 'localhost'
  }
  return hostname
}

/**
 * Builds a browser URL from server options.
 */
export function buildBrowserUrl(options: {
  protocol?: 'http' | 'https'
  hostname?: string
  port: number
}): string {
  const protocol = options.protocol || 'http'
  const hostname = normalizeHostnameForBrowser(options.hostname)
  return `${protocol}://${hostname}:${options.port}`
}

/**
 * Opens a URL in the user's default browser.
 * Cross-platform implementation that works on macOS, Windows, and Linux.
 */
export async function openBrowser(url: string): Promise<void> {
  const platform = process.platform

  let command: string

  switch (platform) {
    case 'darwin':
      command = `open "${url}"`
      break
    case 'win32':
      command = `start "" "${url}"`
      break
    case 'linux':
      command = `xdg-open "${url}"`
      break
    default:
      command = `open "${url}"`
  }

  try {
    await execAsync(command)
  } catch {
    // Silently fail - opening browser is not critical
    // Users can manually open the URL if needed
  }
}
