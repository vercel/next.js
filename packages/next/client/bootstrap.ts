declare global {
  interface Window {
    __next_s?: ReadonlyArray<BootstrapCommand> | Bootstrapper
  }
}

type BootstrapInitCommand = [0]
type BootstrapCommand = BootstrapInitCommand

interface Bootstrapper {
  push(cmd: BootstrapCommand): number
}

let bootstrapPromise: Promise<void> | null = null

export default function bootstrap(): Promise<void> {
  if (!bootstrapPromise) {
    let resolve: () => void
    bootstrapPromise = new Promise((resolver) => {
      resolve = resolver
    })

    const handleCommand = (cmd: BootstrapCommand) => {
      switch (cmd[0]) {
        case 0:
          // TODO: Consider initializing `__webpack_public_path__` here
          resolve()
          break

        default:
          throw new Error(`invariant: unknown command ${JSON.stringify(cmd)}`)
      }
    }

    const commandQueue = window.__next_s
    if (typeof commandQueue != 'undefined' && !Array.isArray(commandQueue)) {
      throw new Error(
        'invariant: expected window.__next to initially be an array'
      )
    }

    window.__next_s = {
      push(cmd) {
        handleCommand(cmd)
        return 0
      },
    }

    if (commandQueue) {
      // We don't use `forEach` here because we don't want to bloat
      // the bootstrapping logic with polyfills.
      for (const cmd of commandQueue) {
        handleCommand(cmd)
      }
    }
  }
  return bootstrapPromise
}
