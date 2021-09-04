import Observable from 'next/dist/compiled/zen-observable'

export default class RenderResult {
  _response: string | Observable<string>
  _dynamic: boolean

  constructor(response: string | Observable<string>, dynamic: boolean) {
    this._response = response
    this._dynamic = dynamic
  }

  async toUnchunkedString(): Promise<string> {
    if (typeof this._response === 'string') {
      return this._response
    }
    const chunks: string[] = []
    await this._response.forEach((chunk) => chunks.push(chunk))
    return chunks.join('')
  }

  forEach(fn: (chunk: string) => void): Promise<void> {
    if (typeof this._response === 'string') {
      const value = this._response
      return new Promise((resolve) => {
        fn(value)
        resolve()
      })
    }
    return this._response.forEach(fn)
  }

  isDynamic(): boolean {
    return this._dynamic
  }

  static fromStatic(value: string): RenderResult {
    return new RenderResult(value, false)
  }

  static empty = RenderResult.fromStatic('')
}
