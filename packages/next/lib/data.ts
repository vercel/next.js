import {useContext} from 'react'
import { DataManagerContext } from 'next-server/dist/lib/data-manager-context'
import { RouterContext } from 'next-server/dist/lib/router-context'
import fetch from 'unfetch'
import {stringify} from 'querystring'

type Args = string|number|Array<string|number>

function generateArgsKey(args: Args[]) {
  return args.reduce((a: string, b: Args): string => {
    if (Array.isArray(b)) {
      return a + generateArgsKey(b)
    }
    if (typeof b !== 'string' && typeof b !== 'number') {
      throw new Error('arguments can only be string or number')
    }
    return a + b.toString()
  }, '')
}

export function createHook(fetcher: (...args: Args[]) => Promise<any>, options: {key: string}) {
  if (!options.key) {
    throw new Error('key not provided to createHook options.')
  }
  return function useData(...args: Array<string|number>) {
    const router: import('next-server/lib/router/router').default = useContext(RouterContext)
    const dataManager: import('next-server/lib/data-manager').DataManager = useContext(DataManagerContext)
    const key = `${router.route}${options.key}${generateArgsKey(args)}`
    const existing = dataManager.get(key)
    if (existing && existing.status === 'resolved') {
      return existing.result
    }

    // @ts-ignore webpack optimization
    if (process.browser) {
      const res = fetch(router.route + '?' + stringify(router.query), {
        headers: {
          accept: 'application/amp.bind+json',
        },
      }).then((res: any) => res.json()).then((result: any) => {
        dataManager.overwrite(result)
      })
      throw res
    } else {
      const res = fetcher(...args).then((result) => {
        dataManager.set(key, {
          status: 'resolved',
          result,
        })
      })
      throw res
    }
  }
}
