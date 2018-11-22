import Server from './'

export { doPageRender, doDocRender, serializeError } from './render'
export { build, watch } from '../babel/index'

export default (opts) => {
  return new Server(opts)
}
