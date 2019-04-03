import {useContext} from 'react'
import { DataManagerContext } from 'next-server/dist/lib/data-manager-context'
import { RouterContext } from 'next-server/dist/lib/router-context'
import fetch from 'unfetch'

export function createHook(fetcher: (...args: any) => Promise<any>, options: {key: string}) {
  if (!options.key) {
    throw new Error('key not provided to createHook options.')
  }
  return function useData(...args: any) {
    const router: import('next-server/lib/router/router').default = useContext(RouterContext)
    const dataManager: import('next-server/lib/data-manager').DataManager = useContext(DataManagerContext)
    const existing = dataManager.get(options.key)
    if (existing && existing.status === 'resolved') {
      return existing.result
    }

    // @ts-ignore webpack optimization
    if (process.browser) {
      const res = fetch(router.route === '/' ? 'index.json' : router.route + '.json').then((res: any) => res.json()).then((result: any) => {
        dataManager.overwrite(result)
      })
      throw res
    } else {
      const res = fetcher(...args).then((result) => {
        dataManager.set(options.key, {
          status: 'resolved',
          result,
        })
      })
      throw res
    }
  }
}
