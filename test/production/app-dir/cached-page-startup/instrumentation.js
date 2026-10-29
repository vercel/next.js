export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ServerResponse } = await import('node:http')
    const { createRequire } = await import(
      /* webpackIgnore: true, turbopackIgnore: true */ 'node:module'
    )
    const nodeRequire = createRequire(`${process.cwd()}/package.json`)
    const originalWriteHead = ServerResponse.prototype.writeHead
    ServerResponse.prototype.writeHead = function (...args) {
      if (!this.headersSent) {
        const loaded = Object.keys(nodeRequire.cache).some((filename) =>
          filename.replaceAll('\\', '/').endsWith('/server/app/page.js')
        )
        this.setHeader('x-test-page-loaded', loaded ? 'yes' : 'no')
      }
      return originalWriteHead.apply(this, args)
    }
  }
}
