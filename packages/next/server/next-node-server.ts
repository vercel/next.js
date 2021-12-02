import fs from 'fs'
import { join } from 'path'
import NextServer from './next-server'

export * from './next-server'

export default class NextNodeServer extends NextServer {
  protected getHasStaticDir(): boolean {
    return fs.existsSync(join(this.dir, 'static'))
  }
}
