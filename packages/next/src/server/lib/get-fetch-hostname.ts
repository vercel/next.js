import { formatHostname } from './format-hostname'

/**
 * Gets the hostname used to fetch pages (also checks whether the server
 * is running on `0.0.0.0` or `::`).
 * @param actualHostname - The host the server runs on.
 * @param providedHostname - The hostname the user provides.
 * @returns
 */
export function getFetchHostname(
  actualHostname: string,
  providedHostname: string | undefined
) {
  return !providedHostname || actualHostname === '0.0.0.0'
    ? 'localhost'
    : actualHostname === '::'
    ? '[::1]'
    : formatHostname(providedHostname)
}
