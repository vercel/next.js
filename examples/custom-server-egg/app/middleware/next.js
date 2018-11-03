'use strict'

const { parse } = require('url')

const handle = async ctx => {
  const reqeustUrl = parse(ctx.url, true)
  ctx.status = 200
  if (/\.js$/.test(ctx.path)) {
    ctx.set('Content-Type', 'application/javascript')
  } else if (/\.css$/.test(ctx.path)) {
    ctx.set('Content-Type', 'text/css')
  }

  await ctx.requestHandler(ctx.req, ctx.res, reqeustUrl)
}

module.exports = () => {
  return async (ctx, next) => {
    const isNextStatic = /\/_next\//.test(ctx.url)
    if (isNextStatic) {
      await handle(ctx)
    } else if (ctx.renderNext) {
      await next()
      await handle(ctx)
    } else {
      await next()
    }
  }
}
