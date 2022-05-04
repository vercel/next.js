import { stringify } from 'querystring'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import {
  MIDDLEWARE_FLIGHT_MANIFEST,
  MIDDLEWARE_SSR_RUNTIME_WEBPACK,
} from '../../../shared/lib/constants'
import {
  createClientComponentFilter,
  createServerComponentFilter,
} from '../loaders/utils'

const PLUGIN_NAME = 'FlightClientPlugin'

const isClientComponent = createClientComponentFilter()
export class FlightClientPlugin {
  constructor() {}

  apply(compiler: any) {
    const context = (this as any).context

    compiler.hooks.make.tapAsync(
      PLUGIN_NAME,
      (compilation: any, callback: any) => {
        console.log('Client compiler `make`.')
        callback()
      }
    )
  }
}
