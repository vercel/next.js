import next from '../server/next'
import {sendHTML} from '../server/render'

const err = Error('App not initialized: please call prepare()')

let app = null
export async function setup (dir) {
  app = next({
    dir,
    dev: true,
    staticMarkup: true,
    quiet: true
  })
  await app.prepare()
  return app
}

export function teardown () {
  if (app) app.close()
  else throw err
}

export async function render (pathname, req = {}, res, query = {}, opts = {}) {
  let html = null
  if (app) {
    res = res || {
      setHeader: () => {},
      end: () => {}
    }
    html = await app.renderToHTML(req, res, pathname, query, opts)
    if (html) sendHTML(res, html)
  } else {
    throw err
  }
  return html
}
