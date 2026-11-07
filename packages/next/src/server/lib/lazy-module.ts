import { InvariantError } from '../../shared/lib/invariant-error'

type PendingLazyModule<TModule> = {
  status: 'pending'
  /** Resolves to the settled state, and never rejects. */
  promise: Promise<SettledLazyModule<TModule>>
}

type SettledLazyModule<TModule> =
  | { status: 'resolved'; module: TModule }
  | { status: 'rejected'; reason: unknown }

export class LazyModule<TModule> {
  private state:
    | { status: 'uninitialized' }
    | PendingLazyModule<TModule>
    | SettledLazyModule<TModule> = { status: 'uninitialized' }

  constructor(
    private readonly load: () => TModule | Promise<TModule>,
    private readonly onLoad: (module: TModule) => void
  ) {}

  loadIfNeeded(): void {
    if (this.state.status !== 'uninitialized') {
      return
    }

    const result = this.load()

    if (!(result instanceof Promise)) {
      this.onLoad(result)
      this.state = { status: 'resolved', module: result }
      return
    }

    this.state = {
      status: 'pending',
      promise: result
        .then((module) => {
          this.onLoad(module)
          const resolved: SettledLazyModule<TModule> = {
            status: 'resolved',
            module,
          }
          this.state = resolved
          return resolved
        })
        .catch((reason) => {
          const rejected: SettledLazyModule<TModule> = {
            status: 'rejected',
            reason,
          }
          this.state = rejected
          return rejected
        }),
    }
  }

  async waitUntilLoaded(): Promise<void> {
    this.loadIfNeeded()

    let state = this.state

    if (state.status === 'pending') {
      state = await state.promise
    }

    if (state.status === 'rejected') {
      throw state.reason
    }
  }

  assertLoaded(): TModule {
    this.loadIfNeeded()

    const state = this.state

    if (state.status === 'resolved') {
      return state.module
    }

    if (state.status === 'rejected') {
      throw state.reason
    }

    throw new InvariantError(
      'The lazy module is still loading. It must be awaited with `waitUntilLoaded()` before it can be accessed.'
    )
  }
}
