import {loader} from 'webpack'

const nextDataLoader: loader.Loader = function (source) {
  const resourcePath = /data.*data\/(.*)\.js/.exec(this.resourcePath)

  return `
  import {useContext} from 'react'
  import { DataManagerContext } from 'next-server/dist/lib/data-manager-context'
  import { RouterContext } from 'next-server/dist/lib/router-context'
  import fetch from 'unfetch'
  
  function createHook(key, fetcher) {
    return function useData() {
      const router = useContext(RouterContext)
      const dataManager = useContext(DataManagerContext)
      const existing = dataManager.get(key)
      if(existing && existing.status === 'resolved') {
        return existing.result
      }
      
      if(process.browser) {
        const res = fetch(router.route === '/' ? 'index.json' : router.route + '.json').then(res => res.json()).then((result) => {
          dataManager.overwrite(result)
        })
        throw res
      } else {
        const res = fetcher().then((result) => {
          dataManager.set(key, {
            status: 'resolved',
            result
          })
        })
        throw res
      }
    }  
  }  
  
  export default createHook('get-uptime')
  `
}

export default nextDataLoader
