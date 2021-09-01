import Observable from 'next/dist/compiled/zen-observable'

export default class RenderResult {
  #observable: Observable<string>
  #dynamic: boolean

  // This is private. Please use the static methods to ensure
  // that dynamic vs. static result types are correctly tracked.
  constructor(observable: Observable<string>, dynamic: boolean) {
    this.#observable = observable
    this.#dynamic = dynamic
  }

  isDynamic(): boolean {
    return this.#dynamic
  }

  forEach(fn: (chunk: string) => void): Promise<void> {
    return this.#observable.forEach(fn)
  }

  async toStaticString(): Promise<string> {
    if (this.#dynamic) {
      throw new Error(
        'invariant: Dynamic results can not be made static. This is a bug in Next.js'
      )
    }
    const chunks: string[] = []
    await this.#observable.forEach((chunk) => chunks.push(chunk))
    return chunks.join('')
  }

  static static(val: string[]): RenderResult {
    return new RenderResult(Observable.from(val), false)
  }

  static dynamic(observable: Observable<string>): RenderResult {
    return new RenderResult(observable, true)
  }

  static concat(results: RenderResult[]): RenderResult {
    const observables: Observable<string>[] = []
    let dynamic = false
    results.forEach((result) => {
      observables.push(result.#observable)
      dynamic = dynamic || result.#dynamic
    })
    // @ts-ignore
    const observable: Observable<string> = Observable.prototype.concat.call(
      // @ts-ignore
      ...observables
    )
    return new RenderResult(observable, dynamic)
  }

  static empty(): RenderResult {
    return EMPTY_RENDER_RESULT
  }
}

const EMPTY_RENDER_RESULT = RenderResult.static([''])
