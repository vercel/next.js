import Server from './'

export { doPageRender, doDocRender, serializeError } from './render'

export default (opts) => {
  return new Server(opts)
}
