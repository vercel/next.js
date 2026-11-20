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

export type NodeOptions = Record<
  string,
  string | string[] | boolean | undefined
>

/**
 * Node.js CLI flags that can be repeated. Node runs every occurrence of these
 * flags, so they need to be preserved individually rather than collapsed into
 * a single value keyed by option name.
 * https://nodejs.org/api/cli.html#--requiremodule
 * https://nodejs.org/api/cli.html#--importmodule
 */
const REPEATABLE_OPTIONS: Record<string, { type: 'string'; multiple: true }> = {
  require: { type: 'string', multiple: true },
  import: { type: 'string', multiple: true },
}

const parseNodeArgs = (args: string[]): NodeOptions => {
  const parsed = parseArgs({
    args,
    strict: false,
    tokens: true,
    options: REPEATABLE_OPTIONS,
  })
  const values: NodeOptions = parsed.values
  const tokens = parsed.tokens

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

    const name = orphan.name

    // If the option is repeatable, accumulate each occurrence instead of
    // collapsing them into a single value.
    if (name in REPEATABLE_OPTIONS) {
      if (Array.isArray(values[name])) {
        values[name].push(token.value)
      } else if (typeof values[name] === 'string') {
        values[name] = [values[name], token.value]
      } else {
        values[name] = token.value
      }
      continue
    }

    // If the token is a positional one, and it has a value, so add it to the
    // values object. If it already exists, append it with a space.
    if (name in values && typeof values[name] === 'string') {
      values[name] += ` ${token.value}`
    } else {
      values[name] = token.value
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
export interface DebugAddress {
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
export const getParsedDebugAddress = (
  address: string | string[] | boolean | undefined
): DebugAddress => {
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
 * Node.js CLI flags that are not allowed in NODE_OPTIONS and must be
 * passed as direct CLI arguments via execArgv.
 * This set is the difference between all Node.js CLI flags and the ones **not**
 * allowed in NODE_OPTIONS, as listed in the Node.js documentation:
 * https://nodejs.org/api/cli.html#node_optionsoptions
 *
 * It is not exhaustive since not all options make sense for Next.js (e.g. --test)
 */
const EXEC_ARGV_ONLY_OPTIONS = new Set([
  'experimental-network-inspection',
  'experimental-storage-inspection',
  'experimental-worker-inspection',
  'experimental-inspector-network-resource',
])

function formatArg(
  key: string,
  value: string | string[] | boolean | undefined
): string | null {
  if (value === true) {
    return `--${key}`
  }

  if (Array.isArray(value)) {
    const formatted: string[] = []
    for (const item of value) {
      const formattedItem = formatArg(key, item)
      if (formattedItem !== null) {
        formatted.push(formattedItem)
      }
    }
    return formatted.length > 0 ? formatted.join(' ') : null
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
}

/**
 * Stringify the arguments to be used in a command line. It will ignore any
 * argument that has a value of `undefined`. Options that are not allowed in
 * NODE_OPTIONS are returned separately as execArgv.
 *
 * @param args The arguments to be stringified.
 * @returns An object with `nodeOptions` string and `execArgv` array.
 */
export function formatNodeOptions(args: NodeOptions): {
  nodeOptions: string
  execArgv: string[]
} {
  const nodeOptionsParts: string[] = []
  const execArgv: string[] = []

  for (const [key, value] of Object.entries(args)) {
    const formatted = formatArg(key, value)
    if (formatted === null) continue

    if (EXEC_ARGV_ONLY_OPTIONS.has(key)) {
      execArgv.push(formatted)
    } else {
      nodeOptionsParts.push(formatted)
    }
  }

  return { nodeOptions: nodeOptionsParts.join(' '), execArgv }
}

export function getParsedNodeOptions(): NodeOptions {
  const args = [...process.execArgv, ...getNodeOptionsArgs()]
  if (args.length === 0) return {}

  return parseNodeArgs(args)
}

export interface EffectiveDebugOptions {
  /**
   * `--inspect-brk` or `--inspect` if this process's inspector is enabled by
   * one, or `--inspect-wait` when `includeWait` is set and neither is given.
   * `undefined` when it isn't enabled (e.g. `--inspect --no-inspect`).
   */
  type: NodeInspectType | 'inspect-wait'
  /**
   * Where the inspector listens, as reported by Node.js. If it's enabled but
   * not running (e.g. its port was taken), Node.js's resolved port on
   * loopback. The port is 0 when a random port was requested.
   */
  address: DebugAddress | undefined
  /** The effective `--inspect-publish-uid` value, if one was given */
  publishUid: string | undefined
}

/**
 * The debugger settings this process runs with. Whether the inspector runs
 * and where it listens come from Node.js itself (`inspector.url()`, or
 * `process.debugPort` when it failed to start), since its option grammar
 * (host-only and port-only values, aliases, negations that differ between
 * Node.js versions) is easy to get subtly wrong. The flags are only used for
 * what Node.js doesn't report: which flag enabled it, the publish-uid
 * setting, and whether a random port (0) was requested. Flags are read like
 * Node.js does: `NODE_OPTIONS` first, then the command line, last occurrence
 * winning.
 *
 * @param inspectorUrl The running inspector's URL (for tests).
 * @param debugPort Node.js's resolved inspector port (for tests).
 */
export function getEffectiveDebugOptions({
  includeWait = false,
  inspectorUrl = (require('inspector') as typeof import('inspector')).url(),
  debugPort = process.debugPort,
}: {
  includeWait?: boolean
  inspectorUrl?: string | undefined
  debugPort?: number
} = {}): EffectiveDebugOptions {
  const result: EffectiveDebugOptions = {
    type: undefined,
    address: undefined,
    publishUid: undefined,
  }
  let inspect = false
  let inspectBrk = false
  let inspectWait = false
  // Whether any startup flag enabled the inspector at all. An inspector that
  // was only opened at runtime (e.g. `inspector.open()`, or SIGUSR1) isn't
  // passed on, like before Next.js read Node.js's inspector state.
  let activated = false
  // Whether any `--no-inspect*` negation was given. How they combine differs
  // between Node.js versions (e.g. `--inspect-brk --no-inspect` disables the
  // inspector in 20.9 but not in later versions).
  let negated = false
  // The last address value given, to detect a requested random port.
  let lastAddress: string | undefined
  for (const [args, separateValues] of [
    // NODE_OPTIONS also accepts `--inspect 9229` (see `getParsedDebugAddress`).
    [getNodeOptionsArgs(), true],
    [process.execArgv, false],
  ] as const) {
    for (let i = 0; i < args.length; i++) {
      const match = /^--([^=]+)(?:=(.*))?$/.exec(args[i])
      if (!match) continue
      let name = match[1].replace(/_/g, '-')
      if (name === 'debug-port') name = 'inspect-port'
      let value: string | undefined = match[2]
      const isActivation =
        name === 'inspect' || name === 'inspect-brk' || name === 'inspect-wait'
      const takesSeparateValue =
        name === 'inspect-port' ||
        name === 'inspect-publish-uid' ||
        (separateValues && isActivation)
      if (
        value === undefined &&
        takesSeparateValue &&
        i + 1 < args.length &&
        !args[i + 1].startsWith('-')
      ) {
        value = args[++i]
      }
      if (isActivation) activated = true
      if (name === 'inspect') {
        inspect = true
        if (value !== undefined) lastAddress = value
      } else if (name === 'inspect-brk') {
        inspectBrk = true
        if (value !== undefined) lastAddress = value
      } else if (name === 'inspect-wait') {
        inspectWait = true
        if (value !== undefined) lastAddress = value
      } else if (name === 'no-inspect') {
        inspect = false
        negated = true
      } else if (name === 'no-inspect-brk') {
        inspectBrk = false
        negated = true
      } else if (name === 'no-inspect-wait') {
        inspectWait = false
        negated = true
      } else if (name === 'inspect-port') {
        if (value !== undefined) lastAddress = value
      } else if (name === 'inspect-publish-uid') {
        result.publishUid = value
      }
    }
  }

  const flagType = inspectBrk
    ? 'inspect-brk'
    : inspect
      ? 'inspect'
      : inspectWait
        ? 'inspect-wait'
        : undefined
  if (!activated) {
    return result
  }
  if (!inspectorUrl) {
    // Not running. Only treat that as a failed start (e.g. its port was
    // taken) when the flags clearly enable it; otherwise it's disabled.
    if (flagType === undefined || negated) {
      return result
    }
  }
  result.type =
    flagType === 'inspect-wait'
      ? includeWait
        ? 'inspect-wait'
        : undefined
      : // Running without an enabling flag left, e.g. `--inspect-brk
        // --no-inspect-brk`, which still starts it without breaking.
        (flagType ?? 'inspect')
  const randomPort = lastAddress !== undefined && /(^|:)0$/.test(lastAddress)
  if (!inspectorUrl) {
    // Enabled, but it didn't start (e.g. its port was taken). Node.js doesn't
    // report the host it tried; loopback never widens it.
    result.address = {
      host: '127.0.0.1',
      port: randomPort ? 0 : debugPort,
    }
    return result
  }
  const url = new URL(inspectorUrl)
  result.address = {
    // Keeps the brackets of an IPv6 address.
    host: url.hostname,
    port: randomPort
      ? 0
      : // An empty port is the ws: default.
        parseInt(url.port || '80', 10),
  }
  return result
}

/**
 * Get the node options from the `NODE_OPTIONS` environment variable (or the
 * given string) and parse them into an object without the inspect options.
 *
 * @returns An object with the parsed node options.
 */
export function getParsedNodeOptionsWithoutInspect(
  nodeOptions: string | undefined = process.env.NODE_OPTIONS
) {
  const args = nodeOptions ? tokenizeArgs(nodeOptions) : []
  if (args.length === 0) return {}

  const parsed = parseNodeArgs(args)

  // Remove inspect options.
  delete parsed.inspect
  delete parsed['inspect-brk']
  delete parsed['inspect_brk']
  delete parsed['inspect-wait']
  delete parsed['inspect_wait']

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

  return formatNodeOptions(args).nodeOptions
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

type HeapStatistics = {
  used_heap_size: number
  heap_size_limit: number
}

/**
 * @internal
 */
export function getMemoryRestartStats<T extends HeapStatistics>(
  isDev: boolean,
  devMemoryThresholdRestart: boolean,
  getHeapStatistics: () => T
): T | undefined {
  if (!isDev || !devMemoryThresholdRestart) {
    return undefined
  }

  const heapStatistics = getHeapStatistics()
  if (heapStatistics.used_heap_size > 0.8 * heapStatistics.heap_size_limit) {
    return heapStatistics
  }

  return undefined
}

export type NodeInspectType = 'inspect' | 'inspect-brk' | undefined

/**
 * Get the debug type from the `NODE_OPTIONS` environment variable.
 */
export function getNodeDebugType(nodeOptions: NodeOptions): NodeInspectType {
  if (nodeOptions.inspect) {
    return 'inspect'
  }
  if (nodeOptions['inspect-brk'] || nodeOptions['inspect_brk']) {
    return 'inspect-brk'
  }
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

// For a child whose output is piped to its parent. Without this,
// process.exit() can drop the last lines written to the pipe. Node already
// does this for terminals.
export function blockOnOutputWrites() {
  for (const stream of [process.stdout, process.stderr]) {
    stream._handle?.setBlocking?.(true)
  }
}
