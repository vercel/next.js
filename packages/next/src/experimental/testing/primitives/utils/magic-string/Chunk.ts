export class Chunk {
  declare start: number
  declare end: number
  declare original: string
  declare intro: string
  declare outro: string
  declare content: string
  declare storeName: boolean | undefined
  declare edited: boolean
  declare previous: Chunk | null
  declare next: Chunk | null

  constructor(start: number, end: number, content: string) {
    this.start = start
    this.end = end
    this.original = content

    this.intro = ''
    this.outro = ''

    this.content = content
    this.storeName = false
    this.edited = false

    this.previous = null
    this.next = null
  }

  appendLeft(content: string): void {
    this.outro += content
  }

  appendRight(content: string): void {
    this.intro = this.intro + content
  }

  clone(): Chunk {
    const chunk = new Chunk(this.start, this.end, this.original)

    chunk.intro = this.intro
    chunk.outro = this.outro
    chunk.content = this.content
    chunk.storeName = this.storeName
    chunk.edited = this.edited

    return chunk
  }

  contains(index: number): boolean {
    return this.start < index && index < this.end
  }

  eachNext(fn: (chunk: Chunk) => void): void {
    fn(this)

    let chunk = this.next
    while (chunk) {
      fn(chunk)
      chunk = chunk.next
    }
  }

  eachPrevious(fn: (chunk: Chunk) => void): void {
    fn(this)

    let chunk = this.previous
    while (chunk) {
      fn(chunk)
      chunk = chunk.previous
    }
  }

  edit(content: string, storeName?: boolean, contentOnly?: boolean): this {
    this.content = content
    if (!contentOnly) {
      this.intro = ''
      this.outro = ''
    }
    this.storeName = storeName

    this.edited = true

    return this
  }

  prependLeft(content: string): void {
    this.outro = content + this.outro
  }

  prependRight(content: string): void {
    this.intro = content + this.intro
  }

  reset(): void {
    this.intro = ''
    this.outro = ''
    if (this.edited) {
      this.content = this.original
      this.storeName = false
      this.edited = false
    }
  }

  split(index: number): Chunk {
    const sliceIndex = index - this.start

    const originalBefore = this.original.slice(0, sliceIndex)
    const originalAfter = this.original.slice(sliceIndex)

    this.original = originalBefore

    const newChunk = new Chunk(index, this.end, originalAfter)
    newChunk.outro = this.outro
    this.outro = ''

    this.end = index

    if (this.edited) {
      // after split we should save the edit content record into the correct chunk
      // to make sure sourcemap correct
      // For example:
      // '  test'.trim()
      //     split   -> '  ' + 'test'
      //   ✔️ edit    -> '' + 'test'
      //   ✖️ edit    -> 'test' + ''
      // TODO is this block necessary?...
      // content only, so the outro moved over above is kept
      newChunk.edit('', false, true)
      this.content = ''
    } else {
      this.content = originalBefore
    }

    newChunk.next = this.next
    if (newChunk.next) newChunk.next.previous = newChunk
    newChunk.previous = this
    this.next = newChunk

    return newChunk
  }

  toString(): string {
    return this.intro + this.content + this.outro
  }

  trimEnd(rx: RegExp): boolean | undefined {
    this.outro = this.outro.replace(rx, '')
    if (this.outro.length) return true

    const trimmed = this.content.replace(rx, '')

    if (trimmed.length) {
      if (trimmed !== this.content) {
        if (this.edited) {
          // the content of an edited chunk no longer lines up with its range in the
          // original string, so there is no index to split at - trim it in place
          this.edit(trimmed, this.storeName, true)
        } else {
          this.split(this.start + trimmed.length).edit('', undefined, true)
        }
      }
      return true
    } else {
      this.edit('', undefined, true)

      this.intro = this.intro.replace(rx, '')
      if (this.intro.length) return true
    }
  }

  trimStart(rx: RegExp): boolean | undefined {
    this.intro = this.intro.replace(rx, '')
    if (this.intro.length) return true

    const trimmed = this.content.replace(rx, '')

    if (trimmed.length) {
      if (trimmed !== this.content) {
        if (this.edited) {
          // the content of an edited chunk no longer lines up with its range in the
          // original string, so there is no index to split at - trim it in place
          this.edit(trimmed, this.storeName, true)
        } else {
          this.split(this.end - trimmed.length)
          this.edit('', undefined, true)
        }
      }
      return true
    } else {
      this.edit('', undefined, true)

      this.outro = this.outro.replace(rx, '')
      if (this.outro.length) return true
    }
  }
}
