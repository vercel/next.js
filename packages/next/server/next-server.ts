import fs from 'fs'
import { join } from 'path'
import NextServer from './base-server'

export * from './base-server'

export default class NextNodeServer extends NextServer {
  protected getHasStaticDir(): boolean {
    return fs.existsSync(join(this.dir, 'static'))
  }
}
