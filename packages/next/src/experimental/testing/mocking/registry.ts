type ModuleExports = Record<string, unknown>
type ImportOriginal = () => Promise<ModuleExports>
type MockFactory = (
  importOriginal: ImportOriginal
) => ModuleExports | Promise<ModuleExports>

interface Registration {
  factory: MockFactory
  importOriginal: ImportOriginal
  result?: Promise<ModuleExports>
}

/**
 * Private factory state for one emitted test-file realm. The compiler supplies
 * target keys resolved with the real importer and layer, and an original import
 * that bypasses only that target. This class neither resolves nor loads modules.
 *
 * The compiler must reject unsupported cycles and schedule registrations before
 * evaluation. Using this primitive does not enable vi.mock by itself.
 */
export class MockRegistry {
  private registrations = new Map<string, Registration>()
  private evaluating = false
  private disposed = false

  register(
    targetKey: string,
    factory: MockFactory,
    importOriginal: ImportOriginal
  ): void {
    this.assertActive()
    if (this.evaluating) {
      throw new Error(
        'Cannot register a module mock after evaluation has started. Dynamic mock registration is not supported.'
      )
    }
    if (typeof factory !== 'function') {
      throw new TypeError(
        'Module mocking requires an explicit factory function.'
      )
    }
    // Ordered hoisted declarations can replace an earlier registration before
    // evaluation. No evaluated namespace is ever replaced in place.
    this.registrations.set(targetKey, { factory, importOriginal })
  }

  resolve(targetKey: string): Promise<ModuleExports> {
    this.assertActive()
    this.evaluating = true
    const registration = this.registrations.get(targetKey)
    if (!registration) {
      throw new Error(`No module mock is registered for target ${targetKey}.`)
    }
    if (!registration.result) {
      // Store the promise before invoking user code, including synchronous
      // factories, so concurrent graph consumers share one evaluation.
      registration.result = Promise.resolve()
        .then(() => {
          this.assertActive()
          return registration.factory(async () => {
            this.assertActive()
            const original = await registration.importOriginal()
            this.assertActive()
            return original
          })
        })
        .then((exports) => {
          this.assertActive()
          if (
            exports === null ||
            typeof exports !== 'object' ||
            Array.isArray(exports)
          ) {
            throw new TypeError(
              'Module mock factory must return an exports object. Use a "default" key for a default export.'
            )
          }
          return exports
        })
        .catch((cause) => {
          throw new Error(`Failed to evaluate module mock ${targetKey}.`, {
            cause,
          })
        })
    }
    return registration.result
  }

  async readExport(targetKey: string, name: string): Promise<unknown> {
    const exports = await this.resolve(targetKey)
    this.assertActive()
    if (!Object.prototype.hasOwnProperty.call(exports, name)) {
      throw new Error(
        `Module mock ${targetKey} does not define export ${JSON.stringify(name)}.`
      )
    }
    return exports[name]
  }

  dispose(): void {
    this.disposed = true
    this.registrations.clear()
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('The module mock registry has been disposed.')
    }
  }
}
