type NextBootloadCommand = {}

interface NextBootloader {
  push(command: NextBootloadCommand): number
}

declare global {
  interface Window {
    __NEXT_BL: Array<NextBootloadCommand> | NextBootloader
  }
}

export function onBoot(callback: () => void) {
  const queuedCommands = window.__NEXT_BL
  if (!Array.isArray(queuedCommands)) {
    throw new Error(
      'invariant: onBoot should only be called once. This is a bug in Next.js'
    )
  }

  let didBoot = false
  const bootloader: NextBootloader = (window.__NEXT_BL = {
    push(_: NextBootloadCommand) {
      if (!didBoot) {
        didBoot = true
        callback()
      }
      return 0
    },
  })

  queuedCommands.forEach((command) => bootloader.push(command))
}
