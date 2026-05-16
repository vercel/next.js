import { isIPv6 } from './is-ipv6'

/**
 * Formats a hostname so that it is a valid host that can be fetched by wrapping
 * IPv6 hosts with brackets.
 * @param hostname
 * @returns
 */
export function formatHostname(hostname: string): string {
  return isIPv6(hostname) ? `[${hostname}]` : hostname
}
