import {loader} from 'webpack'

const nextDataLoader: loader.Loader = function (source) {
  const resourcePath = /data.*data\/(.*)\.js/.exec(this.resourcePath)

  return `
  import {createHook} from 'next/data'
  
  export default createHook('get-uptime')
  `
}

export default nextDataLoader
