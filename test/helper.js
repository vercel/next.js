import next from '../dist/server/next'
import {sendHTML} from '../dist/server/render'
import queryString from 'query-string'

const err = Error('App not initialized: please call prepare()')

/*
  startup the app used during integration testing.

  let app = null
  beforeAll(async () => {
    app = await setup(dir)
  })
*/
let app = null
export async function setup (dir) {
  app = next({
    dir,
    dev: !process.env.SKIP_BUILD,
    staticMarkup: true,
    quiet: true
  })
  await app.prepare()
  return app
}

/*
  after all tests are complete, cleanup the
  integration testing app.

  afterAll(async () => {
    await teardown()
  })
*/
export async function teardown () {
  if (app) await app.close()
  else throw err
}

/*
  helper for rendering a page in the integration testing application:

  render('/my-awesome-search-page', {q: 'banana'})

  req.url is automatically populated.
*/
export async function render (pathname, query = {}, req, res, opts = {}) {
  let html = null
  if (app) {
    req = req || {
      headers: {},
      url: pathname + '?' + queryString.stringify(query)
    }
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
