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

const parseNodeArgs = (args: string[]) => {
  const { values, tokens } = parseArgs({ args, strict: false, tokens: true })

  // For the `NODE_OPTIONS`, we support arguments with values without the `=`
  // sign. We need to parse them manually.
  let orphan = null
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (token.kind === 'option-terminator') {
      break
    }

    // When we encounter an option, if it's value is undefined, we should check
    // to see if the following tokens are positional parameters. If they are,
    // then the option is orphaned, and we can assign it.
    if (token.kind === 'option') {
      orphan = typeof token.value === 'undefined' ? token : null
      continue
    }

    // If the token isn't a positional one, then we can't assign it to the found
    // orphaned option.
    if (token.kind !== 'positional') {
      orphan = null
      continue
    }

    // If we don't have an orphan, then we can skip this token.
    if (!orphan) {
      continue
    }

    // If the token is a positional one, and it has a value, so add it to the
    // values object. If it already exists, append it with a space.
    if (orphan.name in values && typeof values[orphan.name] === 'string') {
      values[orphan.name] += ` ${token.value}`
    } else {
      values[orphan.name] = token.value
    }
  }

  return values
}

/**
 * Tokenizes the arguments string into an array of strings, supporting quoted
 * values and escaped characters.
 * Converted from: https://github.com/nodejs/node/blob/c29d53c5cfc63c5a876084e788d70c9e87bed880/src/node_options.cc#L1401
 *
 * @param input The arguments string to be tokenized.
 * @returns An array of strings with the tokenized arguments.
 */
export const tokenizeArgs = (input: string): string[] => {
  let args: string[] = []
  let isInString = false
  let willStartNewArg = true

  for (let i = 0; i < input.length; i++) {
    let char = input[i]

    // Skip any escaped characters in strings.
    if (char === '\\' && isInString) {
      // Ensure we don't have an escape character at the end.
      if (input.length === i + 1) {
        throw new Error('Invalid escape character at the end.')
      }

      // Skip the next character.
      char = input[++i]
    }
    // If we find a space outside of a string, we should start a new argument.
    else if (char === ' ' && !isInString) {
      willStartNewArg = true
      continue
    }

    // If we find a quote, we should toggle the string flag.
    else if (char === '"') {
      isInString = !isInString
      continue
    }

    // If we're starting a new argument, we should add it to the array.
    if (willStartNewArg) {
      args.push(char)
      willStartNewArg = false
    }
    // Otherwise, add it to the last argument.
    else {
      args[args.length - 1] += char
    }
  }

  if (isInString) {
    throw new Error('Unterminated string')
  }

  return args
}

/**
 * Get the node options from the environment variable `NODE_OPTIONS` and returns
 * them as an array of strings.
 *
 * @returns An array of strings with the node options.
 */
export const getNodeOptionsArgs = () => {
  if (!process.env.NODE_OPTIONS) return []

  return tokenizeArgs(process.env.NODE_OPTIONS)
}

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

  const parsed = parseNodeArgs(args)

  // We expect to find the debug port in one of these options. The first one
  // found will be used.
  const address =
    parsed.inspect ?? parsed['inspect-brk'] ?? parsed['inspect_brk']

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
        return `--${key}=${
          // Values with spaces need to be quoted. We use JSON.stringify to
          // also escape any nested quotes.
          value.includes(' ') && !value.startsWith('"')
            ? JSON.stringify(value)
            : value
        }`
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

  const parsed = parseNodeArgs(args)

  // Remove inspect options.
  delete parsed.inspect
  delete parsed['inspect-brk']
  delete parsed['inspect_brk']

  return parsed
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

/**
 * Check if the value is a valid positive integer and parse it. If it's not, it will throw an error.
 *
 * @param value The value to be parsed.
 */
export function parseValidPositiveInteger(value: string): number {
  const parsedValue = parseInt(value, 10)

  if (isNaN(parsedValue) || !isFinite(parsedValue) || parsedValue < 0) {
    throw new InvalidArgumentError(`'${value}' is not a non-negative number.`)
  }
  return parsedValue
}

export const RESTART_EXIT_CODE = 77

export type NodeInspectType = 'inspect' | 'inspect-brk' | undefined

/**
 * Get the debug type from the `NODE_OPTIONS` environment variable.
 */
export function getNodeDebugType(): NodeInspectType {
  const args = [...process.execArgv, ...getNodeOptionsArgs()]
  if (args.length === 0) return

  const parsed = parseNodeArgs(args)

  if (parsed.inspect) return 'inspect'
  if (parsed['inspect-brk'] || parsed['inspect_brk']) return 'inspect-brk'
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

  const parsed = parseNodeArgs(args)

  const size = parsed['max-old-space-size'] || parsed['max_old_space_size']
  if (!size || typeof size !== 'string') return

  return parseInt(size, 10)
}
