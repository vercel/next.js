import { InvariantError } from '../../shared/lib/invariant-error'

/**
 * Encodes a tuple of strings into a single string,
 * where each part except the last is prefixed with its length.
 * */
export function lengthEncodeTuple(parts: string[]) {
  if (parts.length === 0) {
    return ''
  }

  // Fast path for single-element tuples
  if (parts.length === 1) {
    return ':' + parts[0]
  }

  let encoded = ''
  const lastIx = parts.length - 1
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (i < lastIx) {
      // All parts (other than the last one) are prefixed with their length --
      // we have to know where one part ends and the next part begins.
      encoded += `${part.length}:${part}`
    } else {
      // The last part does not need a length, because there are no more parts after it,
      // and we can just take the rest of the string.
      // But it needs a delimiter so that we don't accidentally interpret contents like "3:"
      // as another length-prefixed part.
      //
      // This could be optimized to only add an escape character if
      // - it's empty (would be skipped when deserializing)
      // - it starts with a ':' (would be mistaken for an escape)
      // - it starts with a number (could be mistaken for a length prefix)
      // but skipping one `.slice()` call when decoding doesn't feel
      // like it's worth the added complexity.
      encoded += `:${part}`
    }
  }
  return encoded
}

export function lengthDecodeTuple(encoded: string): string[] {
  if (!encoded) {
    return []
  }

  let remaining = encoded
  const parts: string[] = []
  while (true) {
    // Check for a length header. If we don't find one, we'll check for a last-part marker.
    // If we don't find that either, the input is malformed.
    const lengthHeaderMatch = remaining.match(/^([0-9]+):/)
    if (lengthHeaderMatch) {
      // This is a length-prefixed part. It can't be the last part.
      // '<length>:<part><moreParts>'

      // Parse the length header
      const partLength = Number.parseInt(lengthHeaderMatch[1])
      if (Number.isNaN(partLength)) {
        throw new InvariantError(
          `Part length cannot be parsed as a number: '${remaining}'`
        )
      }

      // Extract the part, i.e. the next `partLength` characters following the header
      const partContentsStartIx = lengthHeaderMatch[0].length
      const nextPartStartIx = partContentsStartIx + partLength
      const partContents = remaining.slice(partContentsStartIx, nextPartStartIx)
      if (partContents.length !== partLength) {
        throw new InvariantError(
          `Actual part length ${partContents.length} does not match length ${partLength} from header: '${remaining}'`
        )
      }
      parts.push(partContents)

      // Advance to the next part
      remaining = remaining.slice(nextPartStartIx)
      continue
    } else if (remaining && remaining[0] === ':') {
      // The final part is prefixed with a ':', without a length
      // ':<lastPart>'
      parts.push(remaining.slice(1))

      // This was the final part, so we're done parsing
      break
    } else {
      throw new InvariantError(
        `Unexpected part without length header or last-part indicator: '${remaining}'`
      )
    }
  }

  return parts
}

export type TaggedStringTuple = [tag: number, ...rest: string[]]

/**
 * Encodes a tuple of strings into a single string,
 * where each part except the last is prefixed with its length.
 * */
export function lengthEncodeTupleWithTag([tag, ...rest]: TaggedStringTuple) {
  // Technically, we could allow more by using letters, but we don't need that now.
  if (tag < 0 || tag > 9) {
    throw new InvariantError(
      'Tags that cannot be encoded as a single digit are not supported'
    )
  }
  return tag + lengthEncodeTuple(rest)
}

const ASCII_0 = '0'.charCodeAt(0)
const ASCII_9 = '9'.charCodeAt(0)

export function lengthDecodeTupleWithTag(encoded: string): TaggedStringTuple {
  if (!encoded) {
    throw new InvariantError('Expected tag but got empty input')
  }

  // The tag is a single ASCII digit.
  const tagCharCode = encoded.charCodeAt(0)
  if (tagCharCode < ASCII_0 || tagCharCode > ASCII_9) {
    throw new InvariantError(
      `Expected tag to be a numeric digit, but got '${encoded[0]}'`
    )
  }
  const tag = tagCharCode - ASCII_0

  const parts = lengthDecodeTuple(encoded.slice(1)) as (string | number)[]
  parts.unshift(tag)
  return parts as TaggedStringTuple
}
