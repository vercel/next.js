import { parseArgs } from 'node:util'
import { InvalidArgumentError } from 'next/dist/compiled/commander'

export function printAndExit(message: string, code = 1) {
  if (code === 0) {
    console.log(message)
  } else {
    console.error(message)
  }

  return process.exit(code)
}

/**
 * Get the node options from the environment variable `NODE_OPTIONS` and returns
 * them as an array of strings.
 *
 * @returns An array of strings with the node options.
 */
const getNodeOptionsArgs = () =>
  process.env.NODE_OPTIONS?.split(' ').map((arg) => arg.trim()) ?? []

/**
 * The debug address is in the form of `[host:]port`. The host is optional.
 */
type DebugAddress = {
  host: string | undefined
  port: number
}

/**
 * Formats the debug address into a string.
 */
export const formatDebugAddress = ({ host, port }: DebugAddress): string => {
  if (host) return `${host}:${port}`
  return `${port}`
}

/**
 * Get's the debug address from the `NODE_OPTIONS` environment variable. If the
 * address is not found, it returns the default host (`undefined`) and port
 * (`9229`).
 *
 * @returns An object with the host and port of the debug address.
 */
export const getParsedDebugAddress = (): DebugAddress => {
  const args = getNodeOptionsArgs()
  if (args.length === 0) return { host: undefined, port: 9229 }

  const { values } = parseArgs({ args, strict: false })

  // We expect to find the debug port in one of these options. The first one
  // found will be used.
  const address =
    values.inspect ?? values['inspect-brk'] ?? values['inspect_brk']

  if (!address || typeof address !== 'string') {
    return { host: undefined, port: 9229 }
  }

  // The address is in the form of `[host:]port`. Let's parse the address.
  if (address.includes(':')) {
    const [host, port] = address.split(':')
    return { host, port: parseInt(port, 10) }
  }

  return { host: undefined, port: parseInt(address, 10) }
}

/**
 * Get the debug address from the `NODE_OPTIONS` environment variable and format
 * it into a string.
 *
 * @returns A string with the formatted debug address.
 */
export const getFormattedDebugAddress = () =>
  formatDebugAddress(getParsedDebugAddress())

/**
 * Stringify the arguments to be used in a command line. It will ignore any
 * argument that has a value of `undefined`.
 *
 * @param args The arguments to be stringified.
 * @returns A string with the arguments.
 */
export function formatNodeOptions(
  args: Record<string, string | boolean | undefined>
): string {
  return Object.entries(args)
    .map(([key, value]) => {
      if (value === true) {
        return `--${key}`
      }

      if (value) {
        return `--${key}=${value}`
      }

      return null
    })
    .filter((arg) => arg !== null)
    .join(' ')
}

/**
 * Get the node options from the `NODE_OPTIONS` environment variable and parse
 * them into an object without the inspect options.
 *
 * @returns An object with the parsed node options.
 */
export function getParsedNodeOptionsWithoutInspect() {
  const args = getNodeOptionsArgs()
  if (args.length === 0) return {}

  const { values } = parseArgs({ args, strict: false })

  // Remove inspect options.
  delete values.inspect
  delete values['inspect-brk']
  delete values['inspect_brk']

  return values
}

/**
 * Get the node options from the `NODE_OPTIONS` environment variable and format
 * them into a string without the inspect options.
 *
 * @returns A string with the formatted node options.
 */
export function getFormattedNodeOptionsWithoutInspect() {
  const args = getParsedNodeOptionsWithoutInspect()
  if (Object.keys(args).length === 0) return ''

  return formatNodeOptions(args)
}

export function myParseInt(value: string) {
  // parseInt takes a string and a radix
  const parsedValue = parseInt(value, 10)

  if (isNaN(parsedValue) || !isFinite(parsedValue) || parsedValue < 0) {
    throw new InvalidArgumentError(`'${value}' is not a non-negative number.`)
  }
  return parsedValue
}

export const RESTART_EXIT_CODE = 77

/**
 * Get the debug type from the `NODE_OPTIONS` environment variable.
 */
export function getNodeDebugType() {
  const args = [...process.execArgv, ...getNodeOptionsArgs()]
  if (args.length === 0) return

  const { values } = parseArgs({ args, strict: false })

  if (values.inspect) return 'inspect'
  if (values['inspect-brk'] || values['inspect_brk']) return 'inspect-brk'
}

/**
 * Get the `max-old-space-size` value from the `NODE_OPTIONS` environment
 * variable.
 *
 * @returns The value of the `max-old-space-size` option as a number.
 */
export function getMaxOldSpaceSize() {
  const args = getNodeOptionsArgs()
  if (args.length === 0) return

  const { values } = parseArgs({ args, strict: false })

  const size = values['max-old-space-size'] || values['max_old_space_size']
  if (!size || typeof size !== 'string') return

  return parseInt(size, 10)
}
