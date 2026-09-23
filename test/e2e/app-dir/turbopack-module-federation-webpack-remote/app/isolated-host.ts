import { createInstance } from '@module-federation/runtime-tools'
;(globalThis as any).isolatedCatalog = {
  init() {},
  get() {
    return () => ({ message: 'hello from isolated SDK host' })
  },
}

const host = createInstance({
  name: 'isolatedHost',
  remotes: [
    {
      name: '__turbopack_remote_0_0',
      entryGlobalName: 'isolatedCatalog',
      entry: `${process.env.NEXT_PUBLIC_MF_REMOTE_ORIGIN}/browser/remoteEntry.js`,
      type: 'global',
    },
  ],
})

export const message = host
  .loadRemote<{ message: string }>('__turbopack_remote_0_0/message')
  .then((module) => module!.message)
