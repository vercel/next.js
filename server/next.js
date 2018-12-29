import Server from './'

export { $HEAD, doPageRender, doDocRender, serializeError } from './render'

export default (opts) => {
  return new Server(opts)
}
