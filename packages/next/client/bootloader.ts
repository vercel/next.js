type NextBootloadCommand = [string]

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
    push(command: NextBootloadCommand) {
      if (!didBoot) {
        didBoot = true

        assetPrefix = command[0] || ''
        // @ts-ignore
        __webpack_public_path__ = `${assetPrefix}/_next/` //eslint-disable-line

        callback()
      }
      return 0
    },
  })

  queuedCommands.forEach((command) => bootloader.push(command))
}

let assetPrefix: string | null = null
export function getAssetPrefix(): string {
  if (assetPrefix == null) {
    throw new Error(
      'invariant: getAssetPrefix() called before bootstrap. This is a bug in Next.js'
    )
  }
  return assetPrefix
}
