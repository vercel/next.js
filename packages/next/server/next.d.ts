import Server from 'next-server/dist/server/next-server'

interface DevServer extends Server {
  hotLoader: any
  renderOpts: Server['renderOpts'] & { dev: true }
  addExportPathMapRoutes(): Promise<any>
  getCompilationError(page: any): Promise<any>
}

declare function next(options: any): Server
declare function next(options: any & { dev: true }): DevServer

export default next
