import type { DecodedSourceMap, SourceMapOptions } from './SourceMap'
import { BitSet } from './BitSet'
import { Chunk } from './Chunk'
import { MagicStringError } from './MagicStringError'
import { SourceMap } from './SourceMap'
import { getLocator } from './utils/getLocator'
import { getRelativePath } from './utils/getRelativePath'
import { guessIndent } from './utils/guessIndent'
import { isObject } from './utils/isObject'
import { Mappings } from './utils/Mappings'
import { MappingsEncoder } from './utils/MappingsEncoder'

export type ExclusionRange = [number, number]

export interface MagicStringOptions {
  filename?: string
  ignoreList?: boolean
  indentExclusionRanges?: ExclusionRange | ExclusionRange[]
  offset?: number
}

export interface IndentOptions {
  exclude?: ExclusionRange | ExclusionRange[]
  indentStart?: boolean
}

export interface OverwriteOptions {
  storeName?: boolean
  contentOnly?: boolean
}

export interface UpdateOptions {
  storeName?: boolean
  overwrite?: boolean
}

export type ReplacementFunction = (substring: string, ...args: any[]) => string

const n = '\n'
const NEWLINE_CHAR = '\n'.charCodeAt(0)
const CR_CHAR = '\r'.charCodeAt(0)

const warned = {
  insertLeft: false,
  insertRight: false,
  storeName: false,
}

/**
 * Expands the `$` substitution patterns that `String.prototype.replace` accepts
 * in a string replacement.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_a_parameter
 *
 * `captures` holds the capture groups in order, so `captures[0]` is `$1`.
 * `namedCaptures` is `undefined` when the pattern has no named groups, and
 * `$<name>` is then literal text - which is also the case for a string search
 * value, where there are no groups of either kind.
 */
function expandReplacement(
  replacement: string,
  matched: string,
  position: number,
  str: string,
  captures: (string | undefined)[],
  namedCaptures: Record<string, string | undefined> | undefined
): string {
  if (!replacement.includes('$')) return replacement

  let result = ''
  let index = 0

  while (index < replacement.length) {
    const dollar = replacement.indexOf('$', index)
    if (dollar === -1) {
      result += replacement.slice(index)
      break
    }

    result += replacement.slice(index, dollar)

    const char = replacement[dollar + 1]
    // a `$` that introduces nothing recognisable stands for itself, so consume
    // only the `$` and reconsider what follows as text
    let expansion = '$'
    let consumed = 1

    if (char === '$') {
      consumed = 2
    } else if (char === '&') {
      expansion = matched
      consumed = 2
    } else if (char === '`') {
      expansion = str.slice(0, position)
      consumed = 2
    } else if (char === "'") {
      expansion = str.slice(position + matched.length)
      consumed = 2
    } else if (char === '<' && namedCaptures !== undefined) {
      const close = replacement.indexOf('>', dollar + 2)
      if (close !== -1) {
        // an unknown group name expands to nothing rather than staying literal
        expansion = namedCaptures[replacement.slice(dollar + 2, close)] ?? ''
        consumed = close + 1 - dollar
      }
    } else if (char >= '0' && char <= '9') {
      const second = replacement[dollar + 2]
      const double =
        second >= '0' && second <= '9' ? Number(char + second) : Number.NaN
      const single = Number(char)

      // `$nn` only wins over `$n` when it names a group that exists, so `$12`
      // is group 12 given twelve groups and group 1 followed by "2" given one.
      // `$0` names no group and is literal, as is any index past the last group
      if (double >= 1 && double <= captures.length) {
        expansion = captures[double - 1] ?? ''
        consumed = 3
      } else if (single >= 1 && single <= captures.length) {
        // a group that did not participate in the match expands to nothing
        expansion = captures[single - 1] ?? ''
        consumed = 2
      }
    }

    result += expansion
    index = dollar + consumed
  }

  return result
}

export class MagicString {
  declare public readonly original: string
  declare public offset: number

  /** @internal */
  declare private outro: string
  /** @internal */
  declare private intro: string
  /** @internal */
  declare private filename: string | undefined
  /** @internal */
  declare private ignoreList: boolean | undefined
  /** @internal */
  declare private firstChunk: Chunk
  /** @internal */
  declare private lastChunk: Chunk
  /** @internal */
  declare private lastSearchedChunk: Chunk
  /** @internal */
  declare private byStart: Map<number, Chunk>
  /** @internal */
  declare private byEnd: Map<number, Chunk>
  /** @internal */
  declare private sourcemapLocations: BitSet
  /** @internal */
  declare private storedNames: Record<string, true>
  /** @internal */
  declare private indentStr: string | null | undefined
  /** @internal */
  declare private hasMovedChunks: boolean
  /** @internal */
  declare private indentExclusionRanges: MagicStringOptions['indentExclusionRanges']

  constructor(string: string, options: MagicStringOptions = {}) {
    const chunk = new Chunk(0, string.length, string)

    Object.defineProperties(this, {
      original: { writable: true, value: string },
      outro: { writable: true, value: '' },
      intro: { writable: true, value: '' },
      firstChunk: { writable: true, value: chunk },
      lastChunk: { writable: true, value: chunk },
      lastSearchedChunk: { writable: true, value: chunk },
      byStart: { writable: true, value: new Map<number, Chunk>([[0, chunk]]) },
      byEnd: {
        writable: true,
        value: new Map<number, Chunk>([[string.length, chunk]]),
      },
      filename: { writable: true, value: options.filename },
      indentExclusionRanges: {
        writable: true,
        value: options.indentExclusionRanges,
      },
      sourcemapLocations: { writable: true, value: new BitSet() },
      storedNames: { writable: true, value: {} },
      indentStr: { writable: true, value: undefined },
      ignoreList: { writable: true, value: options.ignoreList },
      offset: { writable: true, value: options.offset || 0 },
      hasMovedChunks: { writable: true, value: false },
    })
  }

  /**
   * Adds the specified character index (with respect to the original string) to sourcemap mappings, if `hires` is false.
   */
  addSourcemapLocation(char: number): void {
    this.sourcemapLocations.add(char)
  }

  /**
   * Appends the specified content to the end of the string.
   */
  append(content: string): this {
    if (typeof content !== 'string') {
      throw new MagicStringError(
        `content must be a string, got ${typeof content}`
      )
    }

    this.outro += content
    return this
  }

  /**
   * Appends the specified content at the index in the original string.
   * If a range *ending* with index is subsequently moved, the insert will be moved with it.
   * See also `s.prependLeft(...)`.
   */
  appendLeft(index: number, content: string): this {
    index = index + this.offset

    if (typeof content !== 'string') {
      throw new MagicStringError(
        `content must be a string, got ${typeof content}`
      )
    }

    this._split(index)

    const chunk = this.byEnd.get(index)

    if (chunk) {
      chunk.appendLeft(content)
    } else {
      this.intro += content
    }

    return this
  }

  /**
   * Appends the specified content at the index in the original string.
   * If a range *starting* with index is subsequently moved, the insert will be moved with it.
   * See also `s.prependRight(...)`.
   */
  appendRight(index: number, content: string): this {
    index = index + this.offset

    if (typeof content !== 'string') {
      throw new MagicStringError(
        `content must be a string, got ${typeof content}`
      )
    }

    this._split(index)

    const chunk = this.byStart.get(index)

    if (chunk) {
      chunk.appendRight(content)
    } else {
      this.outro += content
    }

    return this
  }

  /**
   * Does what you'd expect.
   */
  clone(): this {
    const cloned = new MagicString(this.original, {
      filename: this.filename,
      ignoreList: this.ignoreList,
      offset: this.offset,
    })

    let originalChunk: Chunk | null = this.firstChunk
    let clonedChunk =
      (cloned.firstChunk =
      cloned.lastSearchedChunk =
        originalChunk.clone())

    while (originalChunk) {
      cloned.byStart.set(clonedChunk.start, clonedChunk)
      cloned.byEnd.set(clonedChunk.end, clonedChunk)

      const nextOriginalChunk: Chunk | null = originalChunk.next
      const nextClonedChunk = nextOriginalChunk && nextOriginalChunk.clone()

      if (nextClonedChunk) {
        clonedChunk.next = nextClonedChunk
        nextClonedChunk.previous = clonedChunk

        clonedChunk = nextClonedChunk
      }

      originalChunk = nextOriginalChunk
    }

    cloned.lastChunk = clonedChunk

    if (this.indentExclusionRanges) {
      cloned.indentExclusionRanges = this.indentExclusionRanges.slice() as
        | ExclusionRange
        | ExclusionRange[]
    }

    cloned.sourcemapLocations = new BitSet(this.sourcemapLocations)
    cloned.storedNames = { ...this.storedNames }

    cloned.intro = this.intro
    cloned.outro = this.outro
    cloned.hasMovedChunks = this.hasMovedChunks

    return cloned as this
  }

  /**
   * Generates a sourcemap object with raw mappings in array form, rather than encoded as a string.
   * Useful if you need to manipulate the sourcemap further, but most of the time you will use `generateMap` instead.
   */
  generateDecodedMap(options?: SourceMapOptions): DecodedSourceMap {
    options = options || {}

    const mappings = new Mappings(options.hires)
    const names = this._generateMappings(mappings)

    return {
      ...this._mapProperties(options, names),
      mappings: mappings.raw,
      rangeMappings: mappings.rawRangeMappings,
    }
  }

  /**
   * Generates a version 3 sourcemap.
   */
  generateMap(options?: SourceMapOptions): SourceMap {
    options = options || {}

    const encoder = new MappingsEncoder()
    const mappings = new Mappings(options.hires, encoder)
    const names = this._generateMappings(mappings)

    return new SourceMap({
      ...this._mapProperties(options, names),
      mappings: encoder.finish(mappings.rawSegments),
      rangeMappings: mappings.rawRangeMappings,
    })
  }

  /** @internal */
  _generateMappings(mappings: Mappings): string[] {
    const sourceIndex = 0
    const names = Object.keys(this.storedNames)
    const locate = getLocator(this.original)

    if (this.intro) {
      mappings.advance(this.intro)
    }

    this.firstChunk.eachNext((chunk) => {
      const loc = locate(chunk.start)

      if (chunk.intro.length) mappings.advance(chunk.intro)

      if (chunk.edited) {
        mappings.addEdit(
          sourceIndex,
          chunk.content,
          loc,
          chunk.storeName ? names.indexOf(chunk.original) : -1
        )
      } else {
        mappings.addUneditedChunk(
          sourceIndex,
          chunk,
          this.original,
          loc,
          this.sourcemapLocations
        )
      }

      if (chunk.outro.length) mappings.advance(chunk.outro)
    })

    if (this.outro) {
      mappings.advance(this.outro)
    }

    return names
  }

  /** @internal */
  _mapProperties(
    options: SourceMapOptions,
    names: string[]
  ): Omit<DecodedSourceMap, 'mappings' | 'rangeMappings'> {
    return {
      file: options.file ? options.file.split(/[/\\]/).pop() : undefined,
      sources: [
        options.source
          ? getRelativePath(options.file || '', options.source)
          : options.file || '',
      ],
      sourcesContent: options.includeContent ? [this.original] : undefined,
      names,
      x_google_ignoreList: this.ignoreList ? [0] : undefined,
    }
  }

  /** @internal */
  _ensureindentStr(): void {
    if (this.indentStr === undefined) {
      this.indentStr = guessIndent(this.original)
    }
  }

  /** @internal */
  _getRawIndentString(): string | null | undefined {
    this._ensureindentStr()
    return this.indentStr
  }

  getIndentString(): string {
    this._ensureindentStr()
    return this.indentStr === null ? '\t' : this.indentStr!
  }

  /**
   * Prefixes each line of the string with prefix.
   * If prefix is not supplied, the indentation will be guessed from the original content, falling back to a single tab character.
   */
  indent(options?: IndentOptions): this
  /**
   * Prefixes each line of the string with prefix.
   * If prefix is not supplied, the indentation will be guessed from the original content, falling back to a single tab character.
   *
   * The options argument can have an exclude property, which is an array of [start, end] character ranges.
   * These ranges will be excluded from the indentation - useful for (e.g.) multiline strings.
   */
  indent(indentStr?: string, options?: IndentOptions): this
  indent(indentStr?: string | IndentOptions, options?: IndentOptions): this {
    const pattern = /^[^\r\n]/gm

    if (isObject(indentStr)) {
      options = indentStr
      indentStr = undefined
    }

    if (indentStr === undefined) {
      this._ensureindentStr()
      indentStr = this.indentStr || '\t'
    }

    if (indentStr === '') return this // noop
    const resolvedIndentStr = indentStr as string

    options = options || {}

    // Process exclusion ranges
    const isExcluded: Record<number, boolean> = {}

    if (options.exclude) {
      const exclusions =
        typeof options.exclude[0] === 'number'
          ? [options.exclude as ExclusionRange]
          : (options.exclude as ExclusionRange[])
      exclusions.forEach((exclusion) => {
        for (let i = exclusion[0]; i < exclusion[1]; i += 1) {
          isExcluded[i] = true
        }
      })
    }

    let shouldIndentNextCharacter = options.indentStart !== false

    // Indents every line break inside `str`, plus the very first character when
    // `str` starts a line in the generated output. Any match after offset 0
    // necessarily follows a line break inside `str`, so it always gets indented.
    const indentPiece = (str: string) => {
      if (str === '') return str

      const indented = str.replace(pattern, (match: string, offset: number) =>
        offset > 0 || shouldIndentNextCharacter
          ? `${resolvedIndentStr}${match}`
          : match
      )

      shouldIndentNextCharacter = str[str.length - 1] === '\n'

      return indented
    }

    this.intro = indentPiece(this.intro)

    let charIndex = 0
    let chunk: Chunk | null = this.firstChunk

    const indentAt = (index: number) => {
      shouldIndentNextCharacter = false

      if (index === chunk!.start) {
        // `appendRight` rather than `prependRight`, so that the indent lands
        // directly in front of the content rather than in front of an intro
        // that has already been indented in its own right
        chunk!.appendRight(resolvedIndentStr)
      } else {
        this._splitChunk(chunk!, index)
        chunk = chunk!.next
        chunk!.prependRight(resolvedIndentStr)
      }
    }

    while (chunk) {
      const end = chunk.end

      // content added with `appendRight`/`prependRight` is emitted before the
      // chunk itself, so it has to be indented before the chunk is walked
      if (!isExcluded[chunk.start]) chunk.intro = indentPiece(chunk.intro)

      if (chunk.edited) {
        if (!isExcluded[charIndex]) {
          chunk.content = indentPiece(chunk.content)
        }
      } else if (options.exclude) {
        charIndex = chunk.start

        while (charIndex < end) {
          if (!isExcluded[charIndex]) {
            const char = this.original.charCodeAt(charIndex)

            if (char === NEWLINE_CHAR) {
              shouldIndentNextCharacter = true
            } else if (char !== CR_CHAR && shouldIndentNextCharacter) {
              indentAt(charIndex)
            }
          }

          charIndex += 1
        }
      } else {
        charIndex = chunk.start

        while (charIndex < end) {
          if (!shouldIndentNextCharacter) {
            const nextLine = this.original.indexOf(n, charIndex)
            if (nextLine === -1 || nextLine >= end) break

            shouldIndentNextCharacter = true
            charIndex = nextLine + 1
            continue
          }

          const char = this.original.charCodeAt(charIndex)

          if (char === NEWLINE_CHAR || char === CR_CHAR) {
            charIndex += 1
            continue
          }

          indentAt(charIndex)
          charIndex += 1
        }
      }

      // ...and content added with `appendLeft`/`prependLeft` is emitted after it
      if (!isExcluded[chunk.end - 1]) chunk.outro = indentPiece(chunk.outro)

      charIndex = chunk.end
      chunk = chunk.next
    }

    this.outro = indentPiece(this.outro)

    return this
  }

  /** @internal */
  insert(): never {
    throw new MagicStringError(
      'insert() is deprecated, use appendLeft() or prependRight()'
    )
  }

  /** @internal */
  insertLeft(index: number, content: string): this {
    if (!warned.insertLeft) {
      console.warn(
        'magicString.insertLeft(...) is deprecated. Use magicString.appendLeft(...) instead'
      )
      warned.insertLeft = true
    }

    return this.appendLeft(index, content)
  }

  /** @internal */
  insertRight(index: number, content: string): this {
    if (!warned.insertRight) {
      console.warn(
        'magicString.insertRight(...) is deprecated. Use magicString.prependRight(...) instead'
      )
      warned.insertRight = true
    }

    return this.prependRight(index, content)
  }

  /**
   * Moves the characters from `start` and `end` to `index`.
   *
   * `affinity` controls where the range is anchored at `index`. With the
   * default `'right'`, it is inserted before the content that starts at `index`;
   * with `'left'`, it is inserted after the content that ends at `index`. The
   * two differ only when other content has already been moved to that boundary,
   * mirroring the `appendLeft`/`appendRight` distinction.
   */
  move(
    start: number,
    end: number,
    index: number,
    affinity: 'left' | 'right' = 'right'
  ): this {
    start = start + this.offset
    end = end + this.offset
    index = index + this.offset

    if (start === end) return this

    if (index >= start && index <= end) {
      throw new MagicStringError('cannot move a selection inside itself')
    }

    this._split(start)
    this._split(end)
    this._split(index)

    const first = this.byStart.get(start)!
    const last = this.byEnd.get(end)!

    // The splicing below assumes the chunks spanning [start, end) are still a
    // forward run in the current list. An earlier move can have interleaved a
    // chunk from outside the range, or put `last` before `first`, and then the
    // pointer rewrites produce a cycle rather than an error, so toString() and
    // generateMap() loop forever.
    //
    // Only move() reorders chunks, so this is skipped until one has run, which
    // keeps the common single-move case free of the walk.
    if (this.hasMovedChunks) {
      let cursor = first
      while (cursor !== last) {
        cursor = cursor.next!
        if (!cursor || cursor.start < start || cursor.end > end) {
          throw new MagicStringError(
            `cannot move ${start} to ${end} because an earlier move split that range`
          )
        }
      }
    }

    const oldLeft = first.previous
    const oldRight = last.next

    // Anchor the range at `index` according to `affinity`: `'right'` puts it
    // before the chunk starting at `index`, `'left'` after the chunk ending at
    // `index`. When no such anchor exists (`index` is at an end of the string)
    // the range falls to that end.
    //
    // The early returns catch the cases where the range is already in place:
    // splicing it in next to itself would link the chunk list back on itself
    // and drop the range from the output.
    let newLeft: Chunk | null
    let newRight: Chunk | null
    if (affinity === 'left') {
      newLeft = this.byEnd.get(index) ?? null
      if (!newLeft) {
        if (first === this.firstChunk) return this
        newRight = this.firstChunk
      } else {
        if (newLeft.next === first) return this
        newRight = newLeft.next
      }
    } else {
      newRight = this.byStart.get(index) ?? null
      if (!newRight) {
        if (last === this.lastChunk) return this
        newLeft = this.lastChunk
      } else {
        if (newRight.previous === last) return this
        newLeft = newRight.previous
      }
    }

    if (oldLeft) oldLeft.next = oldRight
    if (oldRight) oldRight.previous = oldLeft

    if (newLeft) newLeft.next = first
    if (newRight) newRight.previous = last

    if (!first.previous) this.firstChunk = last.next!
    if (!last.next) {
      this.lastChunk = first.previous!
      this.lastChunk.next = null
    }

    first.previous = newLeft
    last.next = newRight || null

    if (!newLeft) this.firstChunk = first
    if (!newRight) this.lastChunk = last

    this.hasMovedChunks = true

    return this
  }

  /**
   * Replaces the characters from `start` to `end` with `content`, along with the appended/prepended content in
   * that range. The same restrictions as `s.remove()` apply.
   *
   * The fourth argument is optional. It can have a storeName property - if true, the original name will be stored
   * for later inclusion in a sourcemap's names array - and a contentOnly property which determines whether only
   * the content is overwritten, or anything that was appended/prepended to the range as well.
   *
   * It may be preferred to use `s.update(...)` instead if you wish to avoid overwriting the appended/prepended content.
   */
  overwrite(
    start: number,
    end: number,
    content: string,
    options?: boolean | OverwriteOptions
  ): this {
    const optionObject = typeof options === 'object' && options ? options : {}
    return this.update(start, end, content, {
      ...optionObject,
      overwrite: !optionObject.contentOnly,
    })
  }

  /**
   * Replaces the characters from `start` to `end` with `content`. The same restrictions as `s.remove()` apply.
   *
   * The fourth argument is optional. It can have a storeName property - if true, the original name will be stored
   * for later inclusion in a sourcemap's names array - and an overwrite property which determines whether only
   * the content is overwritten, or anything that was appended/prepended to the range as well.
   */
  update(
    start: number,
    end: number,
    content: string,
    options?: boolean | UpdateOptions
  ): this {
    start = start + this.offset
    end = end + this.offset

    if (typeof content !== 'string') {
      throw new MagicStringError(
        `content must be a string, got ${typeof content}`
      )
    }

    if (this.original.length !== 0) {
      if (start < 0) start = Math.max(0, start + this.original.length)
      if (end < 0) end = Math.max(0, end + this.original.length)
    }

    if (start < 0) {
      throw new MagicStringError(`start ${start} is out of bounds`)
    }
    if (end > this.original.length) {
      throw new MagicStringError(`end ${end} is out of bounds`)
    }
    if (start === end) {
      throw new MagicStringError(
        `cannot overwrite a zero-length range at ${start}, use appendLeft() or prependRight()`
      )
    }
    if (start > end) {
      throw new MagicStringError(
        `end must be greater than start (start: ${start}, end: ${end})`
      )
    }

    this._split(start)
    this._split(end)

    if (options === true) {
      if (!warned.storeName) {
        console.warn(
          'The final argument to magicString.overwrite(...) should be an options object. See https://github.com/rich-harris/magic-string'
        )
        warned.storeName = true
      }

      options = { storeName: true }
    }
    const optionObject = typeof options === 'object' && options ? options : {}
    const storeName = optionObject.storeName || false
    const overwrite = optionObject.overwrite || false

    if (storeName) {
      const original = this.original.slice(start, end)
      Object.defineProperty(this.storedNames, original, {
        writable: true,
        value: true,
        enumerable: true,
      })
    }

    const first = this.byStart.get(start)!
    const last = this.byEnd.get(end)!

    /* v8 ignore else -- unreachable: a valid start/end always yields a `first` chunk */
    if (first) {
      let chunk = first
      while (chunk !== last) {
        if (chunk.next !== this.byStart.get(chunk.end)) {
          throw new MagicStringError('cannot overwrite across a split point')
        }
        chunk = chunk.next!
        // `first` takes the replacement and the rest of the range is emptied.
        // Unless overwriting, inserts on these chunks are kept as they are on
        // `first`, so the result does not depend on where the range was split
        chunk.edit('', false, !overwrite)
      }

      first.edit(content, storeName, !overwrite)
    } else {
      // must be inserting at the end
      const newChunk = new Chunk(start, end, '').edit(content, storeName)

      // TODO last chunk in the array may not be the last chunk, if it's moved...
      last.next = newChunk
      newChunk.previous = last
    }

    return this
  }

  /**
   * Prepends the string with the specified content.
   */
  prepend(content: string): this {
    if (typeof content !== 'string') {
      throw new MagicStringError(
        `content must be a string, got ${typeof content}`
      )
    }

    this.intro = content + this.intro
    return this
  }

  /**
   * Same as `s.appendLeft(...)`, except that the inserted content will go *before* any previous appends or prepends at index
   */
  prependLeft(index: number, content: string): this {
    index = index + this.offset

    if (typeof content !== 'string') {
      throw new MagicStringError(
        `content must be a string, got ${typeof content}`
      )
    }

    this._split(index)

    const chunk = this.byEnd.get(index)

    if (chunk) {
      chunk.prependLeft(content)
    } else {
      this.intro = content + this.intro
    }

    return this
  }

  /**
   * Same as `s.appendRight(...)`, except that the inserted content will go *before* any previous appends or prepends at `index`
   */
  prependRight(index: number, content: string): this {
    index = index + this.offset

    if (typeof content !== 'string') {
      throw new MagicStringError(
        `content must be a string, got ${typeof content}`
      )
    }

    this._split(index)

    const chunk = this.byStart.get(index)

    if (chunk) {
      chunk.prependRight(content)
    } else {
      this.outro = content + this.outro
    }

    return this
  }

  /**
   * Removes the characters from `start` to `end` (of the original string, **not** the generated string).
   * Content appended or prepended at positions strictly inside the range is removed with it, while
   * content attached at `start` or `end` is preserved — use `s.overwrite(start, end, '')` to remove
   * the range including its edge inserts.
   * Repeated removals and removals with partially overlapping ranges are allowed.
   */
  remove(start: number, end: number): this {
    start = start + this.offset
    end = end + this.offset

    if (this.original.length !== 0) {
      if (start < 0) start = Math.max(0, start + this.original.length)
      if (end < 0) end = Math.max(0, end + this.original.length)
    }

    if (start === end) return this

    if (start < 0 || end > this.original.length) {
      throw new MagicStringError(`range ${start}–${end} is out of bounds`)
    }
    if (start > end) {
      throw new MagicStringError(
        `end must be greater than start (start: ${start}, end: ${end})`
      )
    }

    this._split(start)
    this._split(end)

    let chunk: Chunk | null | undefined = this.byStart.get(start)

    while (chunk) {
      // inserts anchored to the edges of the removed range are kept; only
      // inserts strictly inside the range are removed with the original chars
      if (chunk.start > start) chunk.intro = ''
      if (chunk.end < end) chunk.outro = ''
      chunk.edit('', false, true)

      chunk = end > chunk.end ? this.byStart.get(chunk.end) : null
    }

    return this
  }

  /**
   * Reset the modified characters from `start` to `end` (of the original string, **not** the generated string).
   */
  reset(start: number, end: number): this {
    start = start + this.offset
    end = end + this.offset

    if (this.original.length !== 0) {
      if (start < 0) start = Math.max(0, start + this.original.length)
      if (end < 0) end = Math.max(0, end + this.original.length)
    }

    if (start === end) return this

    if (start < 0 || end > this.original.length) {
      throw new MagicStringError(`range ${start}–${end} is out of bounds`)
    }
    if (start > end) {
      throw new MagicStringError(
        `end must be greater than start (start: ${start}, end: ${end})`
      )
    }

    this._split(start)
    this._split(end)

    let chunk: Chunk | null | undefined = this.byStart.get(start)

    while (chunk) {
      chunk.reset()

      chunk = end > chunk.end ? this.byStart.get(chunk.end) : null
    }

    return this
  }

  lastChar(): string {
    if (this.outro.length) return this.outro[this.outro.length - 1]
    let chunk: Chunk | null = this.lastChunk
    while (chunk) {
      if (chunk.outro.length) return chunk.outro[chunk.outro.length - 1]
      if (chunk.content.length) return chunk.content[chunk.content.length - 1]
      if (chunk.intro.length) return chunk.intro[chunk.intro.length - 1]
      chunk = chunk.previous
    }
    if (this.intro.length) return this.intro[this.intro.length - 1]
    return ''
  }

  lastLine(): string {
    let lineIndex = this.outro.lastIndexOf(n)
    if (lineIndex !== -1) return this.outro.slice(lineIndex + 1)
    let lineStr = this.outro
    let chunk: Chunk | null = this.lastChunk
    while (chunk) {
      if (chunk.outro.length > 0) {
        lineIndex = chunk.outro.lastIndexOf(n)
        if (lineIndex !== -1) return chunk.outro.slice(lineIndex + 1) + lineStr
        lineStr = chunk.outro + lineStr
      }

      if (chunk.content.length > 0) {
        lineIndex = chunk.content.lastIndexOf(n)
        if (lineIndex !== -1)
          return chunk.content.slice(lineIndex + 1) + lineStr
        lineStr = chunk.content + lineStr
      }

      if (chunk.intro.length > 0) {
        lineIndex = chunk.intro.lastIndexOf(n)
        if (lineIndex !== -1) return chunk.intro.slice(lineIndex + 1) + lineStr
        lineStr = chunk.intro + lineStr
      }
      chunk = chunk.previous
    }
    lineIndex = this.intro.lastIndexOf(n)
    if (lineIndex !== -1) return this.intro.slice(lineIndex + 1) + lineStr
    return this.intro + lineStr
  }

  /**
   * Returns the content of the generated string that corresponds to the slice between `start` and `end` of the original string.
   * Throws error if the indices are for characters that were already removed.
   */
  slice(
    start: number = 0,
    end: number = this.original.length - this.offset
  ): string {
    start = start + this.offset
    end = end + this.offset

    if (this.original.length !== 0) {
      if (start < 0) start = Math.max(0, start + this.original.length)
      if (end < 0) end = Math.max(0, end + this.original.length)
    }

    let result = ''

    // find start chunk
    let chunk: Chunk | null = this.firstChunk
    while (chunk && (chunk.start > start || chunk.end <= start)) {
      // found end chunk before start
      if (
        (chunk.start < end && chunk.end >= end) ||
        (end === 0 && chunk.start === 0)
      ) {
        return result
      }

      chunk = chunk.next
    }

    if (chunk && chunk.edited && chunk.start !== start) {
      throw new MagicStringError(
        `cannot use edited character ${start} as slice start anchor`
      )
    }

    const startChunk = chunk
    while (chunk) {
      // for end === 0 the slice ends at the very start of the original, so stop
      // once the walk reaches the chunk holding that position, taking nothing from it
      if (end === 0 && chunk.start === 0) {
        break
      }

      if (chunk.intro && (startChunk !== chunk || chunk.start === start)) {
        result += chunk.intro
      }

      const containsEnd = chunk.start < end && chunk.end >= end
      if (containsEnd && chunk.edited && chunk.end !== end) {
        throw new MagicStringError(
          `cannot use edited character ${end} as slice end anchor`
        )
      }

      const sliceStart = startChunk === chunk ? start - chunk.start : 0
      const sliceEnd = containsEnd
        ? chunk.content.length + end - chunk.end
        : chunk.content.length

      result += chunk.content.slice(sliceStart, sliceEnd)

      if (chunk.outro && (!containsEnd || chunk.end === end)) {
        result += chunk.outro
      }

      if (containsEnd) {
        break
      }

      chunk = chunk.next
    }

    return result
  }

  // TODO deprecate this? not really very useful
  /**
   * Returns a clone of `s`, with all content before the `start` and `end` characters of the original string removed.
   */
  snip(start: number, end: number): this {
    const clone = this.clone()
    clone.remove(0, start)
    clone.remove(end, clone.original.length)

    return clone
  }

  /** @internal */
  _split(index: number): boolean | void {
    if (this.byStart.get(index) || this.byEnd.get(index)) return

    let chunk: Chunk | undefined = this.lastSearchedChunk
    let previousChunk: Chunk | undefined = chunk
    const searchForward = index > chunk.end

    while (chunk) {
      if (chunk.contains(index)) return this._splitChunk(chunk, index)

      chunk = searchForward
        ? this.byStart.get(chunk.end)
        : this.byEnd.get(chunk.start)

      // Prevent infinite loop (e.g. via empty chunks, where start === end)
      if (chunk === previousChunk) return

      previousChunk = chunk
    }
  }

  /** @internal */
  _splitChunk(chunk: Chunk, index: number): true {
    if (chunk.edited && chunk.content.length) {
      // zero-length edited chunks are a special case (overlapping replacements)
      const loc = getLocator(this.original)(index)
      throw new MagicStringError(
        `cannot split a chunk that has already been edited (${loc.line}:${loc.column} – "${chunk.original}")`
      )
    }

    const newChunk = chunk.split(index)

    this.byEnd.set(index, chunk)
    this.byStart.set(index, newChunk)
    this.byEnd.set(newChunk.end, newChunk)

    if (chunk === this.lastChunk) this.lastChunk = newChunk

    this.lastSearchedChunk = chunk

    return true
  }

  /**
   * Returns the generated string.
   */
  toString(): string {
    let str = this.intro

    let chunk: Chunk | null = this.firstChunk
    while (chunk) {
      str += chunk.toString()
      chunk = chunk.next
    }

    return str + this.outro
  }

  /**
   * Returns true if the resulting source is empty (disregarding white space).
   */
  isEmpty(): boolean {
    // mirrors toString(): the string-level intro and outro bookend the chunks
    if (this.intro.length && this.intro.trim()) return false
    let chunk: Chunk | null = this.firstChunk
    while (chunk) {
      if (
        (chunk.intro.length && chunk.intro.trim()) ||
        (chunk.content.length && chunk.content.trim()) ||
        (chunk.outro.length && chunk.outro.trim())
      ) {
        return false
      }
      chunk = chunk.next
    }
    if (this.outro.length && this.outro.trim()) return false
    return true
  }

  length(): number {
    let chunk: Chunk | null = this.firstChunk
    let length = 0
    while (chunk) {
      length += chunk.intro.length + chunk.content.length + chunk.outro.length
      chunk = chunk.next
    }
    return length
  }

  /**
   * Removes empty lines from the start and end.
   */
  trimLines(): this {
    return this.trim('[\\r\\n]')
  }

  /**
   * Trims content matching `charType` (defaults to `\s`, i.e. whitespace) from the start and end.
   */
  trim(charType?: string): this {
    return this.trimStart(charType).trimEnd(charType)
  }

  /** @internal */
  trimEndAborted(charType?: string): boolean {
    const rx = new RegExp(`${charType || '\\s'}+$`)

    this.outro = this.outro.replace(rx, '')
    if (this.outro.length) return true

    let chunk: Chunk | null = this.lastChunk

    do {
      const end = chunk.end
      const aborted = chunk.trimEnd(rx)

      // if chunk was trimmed, we have a new lastChunk
      if (chunk.end !== end) {
        if (this.lastChunk === chunk) {
          this.lastChunk = chunk.next!
        }

        this.byEnd.set(chunk.end, chunk)
        this.byStart.set(chunk.next!.start, chunk.next!)
        this.byEnd.set(chunk.next!.end, chunk.next!)
      }

      if (aborted) return true
      chunk = chunk.previous
    } while (chunk)

    // like Chunk#trimEnd, carry on into the intro once everything after it has
    // been trimmed away, since the intro is then the end of the string
    this.intro = this.intro.replace(rx, '')
    return this.intro.length > 0
  }

  /**
   * Trims content matching `charType` (defaults to `\s`, i.e. whitespace) from the end.
   */
  trimEnd(charType?: string): this {
    this.trimEndAborted(charType)
    return this
  }

  /** @internal */
  trimStartAborted(charType?: string): boolean {
    const rx = new RegExp(`^${charType || '\\s'}+`)

    this.intro = this.intro.replace(rx, '')
    if (this.intro.length) return true

    let chunk: Chunk | null = this.firstChunk

    do {
      const end = chunk.end
      const aborted = chunk.trimStart(rx)

      if (chunk.end !== end) {
        // special case...
        if (chunk === this.lastChunk) this.lastChunk = chunk.next!

        this.byEnd.set(chunk.end, chunk)
        this.byStart.set(chunk.next!.start, chunk.next!)
        this.byEnd.set(chunk.next!.end, chunk.next!)
      }

      if (aborted) return true
      chunk = chunk.next
    } while (chunk)

    // like Chunk#trimStart, carry on into the outro once everything before it
    // has been trimmed away, since the outro is then the start of the string
    this.outro = this.outro.replace(rx, '')
    return this.outro.length > 0
  }

  /**
   * Trims content matching `charType` (defaults to `\s`, i.e. whitespace) from the start.
   */
  trimStart(charType?: string): this {
    this.trimStartAborted(charType)
    return this
  }

  /**
   * Indicates if the string has been changed.
   */
  hasChanged(): boolean {
    if (this.intro || this.outro) return true

    // How much of `original` the chunks visited so far reproduce, which is not
    // the same as how much of it they span: an overwrite covering several
    // chunks stores the whole replacement on the first of them and empties the
    // rest, so a chunk's content has to be compared against the original text
    // at the offset it is emitted at rather than against its own start and end
    let outputIndex = 0
    let chunk: Chunk | null = this.firstChunk

    while (chunk) {
      // Any intro/outro on a chunk means content was inserted
      if (chunk.intro || chunk.outro) return true

      if (!chunk.edited && chunk.start === outputIndex) {
        // An untouched chunk still at its original offset reproduces the
        // original exactly, so it needs no comparison
        outputIndex = chunk.end
      } else {
        // `startsWith` with an offset compares in place, where slicing the
        // original first would allocate on every edited chunk
        if (!this.original.startsWith(chunk.content, outputIndex)) return true

        outputIndex += chunk.content.length
      }

      chunk = chunk.next
    }

    return outputIndex !== this.original.length
  }

  /**
   * Whether the original range [start, end) has had any of its characters
   * removed. `replace`/`replaceAll` search `original`, so a match can land on
   * text that is no longer in the output - overwriting it would resurrect the
   * removed characters, so such matches are skipped instead.
   *
   * @internal
   */
  _hasRemovedContent(start: number, end: number): boolean {
    // Chunks tile `original`, so only those overlapping [start, end) matter: find
    // the one holding `start`, searching from the last visited chunk as _split
    // does, and walk forward through byStart. replace/replaceAll call this once
    // per match, so scanning the whole list from firstChunk made them quadratic.
    let chunk: Chunk | null | undefined = this.byStart.get(start)
    if (!chunk) {
      chunk = this.lastSearchedChunk
      const searchForward = start >= chunk.end
      while (chunk && !chunk.contains(start))
        chunk = searchForward
          ? this.byStart.get(chunk.end)
          : this.byEnd.get(chunk.start)
      if (chunk) this.lastSearchedChunk = chunk
    }
    while (chunk && chunk.start < end) {
      if (chunk.content === '') return true
      chunk = this.byStart.get(chunk.end)
    }
    return false
  }

  /** @internal */
  _replaceRegexp(
    searchValue: RegExp,
    replacement: string | ReplacementFunction
  ): this {
    function getReplacement(match: RegExpMatchArray, str: string): string {
      if (typeof replacement === 'string') {
        return expandReplacement(
          replacement,
          match[0],
          match.index!,
          str,
          match.slice(1),
          match.groups
        )
      } else {
        // `String.prototype.replace` only passes the named-capture-groups object
        // when the pattern actually has named groups - passing an `undefined`
        // there unconditionally shifts the last argument a replacer sees
        return match.groups === undefined
          ? replacement(match[0], ...match.slice(1), match.index, str)
          : replacement(
              match[0],
              ...match.slice(1),
              match.index,
              str,
              match.groups
            )
      }
    }
    // Returns true once a surviving match has been handled, so a non-global
    // search can stop at the first match still present in the output.
    const replaceMatch = (match: RegExpMatchArray): boolean => {
      /* v8 ignore next 2 -- `match.index` is always defined for matches from `matchAll` */
      if (match.index == null) return false

      if (this._hasRemovedContent(match.index, match.index + match[0].length))
        return false

      const renderedReplacement = getReplacement(match, this.original)
      if (renderedReplacement === match[0]) return true

      if (match[0].length === 0) {
        // a zero-length match spans no characters, so there is no range to
        // overwrite - the replacement is an insertion at the matched position,
        // which is what `String.prototype.replace` does for an empty match
        this.appendRight(match.index - this.offset, renderedReplacement)
      } else {
        this.overwrite(
          match.index - this.offset,
          match.index + match[0].length - this.offset,
          renderedReplacement
        )
      }
      return true
    }

    if (searchValue.global) {
      // `String.prototype.replace` starts a global regexp from the beginning of
      // the string, so reset `lastIndex` - a regexp that has already been used
      // would otherwise resume from wherever it stopped and skip earlier matches.
      // `matchAll` also steps over a zero-length match, where `exec` in a loop
      // would keep rematching it at an unmoving `lastIndex` and never terminate.
      searchValue.lastIndex = 0
      for (const match of this.original.matchAll(searchValue)) {
        replaceMatch(match)
      }
    } else {
      // `.match` respects a custom `Symbol.match`, so keep using it for the
      // first match; only when that match sits on removed content fall back to
      // scanning for the next match still present in the output
      const match = this.original.match(searchValue)
      if (match && !replaceMatch(match)) {
        const global = new RegExp(searchValue.source, `${searchValue.flags}g`)
        for (const next of this.original.matchAll(global)) {
          if (replaceMatch(next)) break
        }
      }
    }
    return this
  }

  /** @internal */
  _replaceString(
    string: string,
    replacement: string | ReplacementFunction
  ): this {
    const { original } = this

    // skip occurrences whose characters have been removed, so the first match
    // still present in the output is the one replaced
    let index = original.indexOf(string)
    while (index !== -1) {
      if (this._hasRemovedContent(index, index + string.length)) {
        index = original.indexOf(string, index + string.length)
        continue
      }

      if (typeof replacement === 'function') {
        replacement = replacement(string, index, original)
      } else {
        replacement = expandReplacement(
          replacement,
          string,
          index,
          original,
          [],
          undefined
        )
      }
      if (string !== replacement) {
        if (string.length === 0) {
          // an empty search string matches the empty range at the start of the
          // string, which has no characters to overwrite - the replacement is an
          // insertion there, as it is for `String.prototype.replace`
          this.appendRight(index - this.offset, replacement)
        } else {
          this.overwrite(
            index - this.offset,
            index + string.length - this.offset,
            replacement
          )
        }
      }
      break
    }

    return this
  }

  /**
   * String replacement with RegExp or string.
   */
  replace(
    searchValue: string | RegExp,
    replacement: string | ReplacementFunction
  ): this {
    if (typeof searchValue === 'string') {
      return this._replaceString(searchValue, replacement)
    }

    return this._replaceRegexp(searchValue, replacement)
  }

  /** @internal */
  _replaceAllString(
    string: string,
    replacement: string | ReplacementFunction
  ): this {
    const { original } = this
    const stringLength = string.length

    // an empty search string matches the empty range before every character plus
    // one at the end, and `indexOf` clamps its start index to the string length,
    // so it can neither find those ranges nor ever report -1 - step through them
    if (stringLength === 0) {
      for (let index = 0; index <= original.length; index += 1) {
        // an empty match inside removed content is not in the output, so skip it
        // and leave the replacer uncalled, as the regexp path does
        if (this._hasRemovedContent(index, index)) continue

        const _replacement =
          typeof replacement === 'function'
            ? replacement('', index, original)
            : expandReplacement(replacement, '', index, original, [], undefined)
        if (_replacement !== '')
          this.appendRight(index - this.offset, _replacement)
      }

      return this
    }

    for (
      let index = original.indexOf(string);
      index !== -1;
      index = original.indexOf(string, index + stringLength)
    ) {
      if (this._hasRemovedContent(index, index + stringLength)) continue

      const previous = original.slice(index, index + stringLength)
      const _replacement =
        typeof replacement === 'function'
          ? replacement(previous, index, original)
          : expandReplacement(
              replacement,
              previous,
              index,
              original,
              [],
              undefined
            )
      if (previous !== _replacement)
        this.overwrite(
          index - this.offset,
          index + stringLength - this.offset,
          _replacement
        )
    }

    return this
  }

  /**
   * Same as `s.replace`, but replace all matched strings instead of just one.
   */
  replaceAll(
    searchValue: string | RegExp,
    replacement: string | ReplacementFunction
  ): this {
    if (typeof searchValue === 'string') {
      return this._replaceAllString(searchValue, replacement)
    }

    if (!searchValue.global) {
      throw new MagicStringError('replaceAll() requires a global RegExp')
    }

    return this._replaceRegexp(searchValue, replacement)
  }
}
