import Server from '../next-server'

export default class WebServer extends Server {
  protected getHasStaticDir(): boolean {
    return false
  }
}
