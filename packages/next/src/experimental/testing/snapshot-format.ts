import type { SnapshotStateOptions } from './primitives'

export type SnapshotFormat = Omit<
  NonNullable<SnapshotStateOptions['snapshotFormat']>,
  'plugins' | 'compareKeys'
> & { compareKeys?: null | undefined }

const optionTypes = {
  callToJSON: 'boolean',
  escapeRegex: 'boolean',
  escapeString: 'boolean',
  highlight: 'boolean',
  indent: 'number',
  maxDepth: 'number',
  maxWidth: 'number',
  maxOutputLength: 'number',
  min: 'boolean',
  printBasicPrototype: 'boolean',
  printFunctionName: 'boolean',
  printShadowRoot: 'boolean',
  compareKeys: 'null',
  spacingInner: 'string',
  spacingOuter: 'string',
  singleQuote: 'boolean',
  quoteKeys: 'boolean',
} as const satisfies Record<keyof SnapshotFormat, string>

const numberOptions = [
  'indent',
  'maxDepth',
  'maxWidth',
  'maxOutputLength',
] as const
type NumberOption = (typeof numberOptions)[number]

type EncodedNumber = {
  type: 'snapshot-format-number'
  value: 'Infinity' | '-Infinity' | 'NaN' | '-0'
}
type EncodedUndefined = { type: 'snapshot-format-undefined' }

/** JSON must preserve explicit undefined options and exceptional number values. */
export type SnapshotFormatWire = {
  [Key in keyof SnapshotFormat]:
    | SnapshotFormat[Key]
    | EncodedUndefined
    | (Key extends NumberOption ? EncodedNumber : never)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be an object.`)
  return value as Record<string, unknown>
}

/** Child formatting is ignored after the pinned configuration admission step. */
export function preflightProjectSnapshotFormat(value: unknown): void {
  if (
    value &&
    'plugins' in (value as object) &&
    typeof (value as { compareKeys?: unknown }).compareKeys === 'function'
  )
    throw new TypeError(
      '"snapshotFormat.compareKeys" function is not supported.'
    )
}

/** Keep authored values; pretty-format owns their formatting semantics. */
export function parseSnapshotFormat(
  value: unknown,
  label = 'config.snapshotFormat'
): SnapshotFormat | undefined {
  if (value === undefined) return undefined
  const input = record(value, label)
  const format: Record<string, unknown> = {}
  for (const key of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(optionTypes, key))
      throw new TypeError(
        `${label}.${key} is not a supported snapshot format option.`
      )
    const item = input[key]
    const expected = optionTypes[key as keyof typeof optionTypes]
    if (
      item !== undefined &&
      (expected === 'null' ? item !== null : typeof item !== expected)
    )
      throw new TypeError(`${label}.${key} must be ${expected}.`)
    format[key] = item
  }
  return format as SnapshotFormat
}

export function encodeSnapshotFormat(
  format: SnapshotFormat | undefined
): SnapshotFormatWire | undefined {
  if (format === undefined) return undefined
  const wire: Record<string, unknown> = { ...format }
  for (const key of Object.keys(format)) {
    if (format[key as keyof SnapshotFormat] === undefined)
      wire[key] = {
        type: 'snapshot-format-undefined',
      } satisfies EncodedUndefined
  }
  for (const key of numberOptions) {
    const value = format[key]
    if (
      value === undefined ||
      (Number.isFinite(value) && !Object.is(value, -0))
    )
      continue
    wire[key] = {
      type: 'snapshot-format-number',
      value: Number.isNaN(value)
        ? 'NaN'
        : Object.is(value, -0)
          ? '-0'
          : value === Infinity
            ? 'Infinity'
            : '-Infinity',
    } satisfies EncodedNumber
  }
  return wire as SnapshotFormatWire
}

export function decodeSnapshotFormat(
  value: unknown,
  label = 'config.snapshotFormat'
): SnapshotFormat | undefined {
  if (value === undefined) return undefined
  const format = { ...record(value, label) }
  for (const key of Object.keys(format)) {
    const item = format[key]
    if (item === null || typeof item !== 'object') continue
    const encoded = item as Record<string, unknown>
    if (encoded.type !== 'snapshot-format-undefined') continue
    if (
      Object.keys(encoded).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(encoded, 'type')
    )
      throw new TypeError(`${label}.${key} has an invalid encoded undefined.`)
    format[key] = undefined
  }
  for (const key of numberOptions) {
    const item = format[key]
    if (item === null || typeof item !== 'object') continue
    const encoded = item as Record<string, unknown>
    if (
      Object.keys(encoded).length !== 2 ||
      !Object.prototype.hasOwnProperty.call(encoded, 'type') ||
      !Object.prototype.hasOwnProperty.call(encoded, 'value') ||
      encoded.type !== 'snapshot-format-number'
    )
      throw new TypeError(`${label}.${key} has an invalid encoded number.`)
    switch (encoded.value) {
      case 'Infinity':
        format[key] = Infinity
        break
      case '-Infinity':
        format[key] = -Infinity
        break
      case 'NaN':
        format[key] = NaN
        break
      case '-0':
        format[key] = -0
        break
      default:
        throw new TypeError(`${label}.${key} has an invalid encoded number.`)
    }
  }
  return parseSnapshotFormat(format, label)
}
