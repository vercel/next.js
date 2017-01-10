const { Readable } = require('stream')

function pathWrapper (app, pathName, opts) {
  return function (hapiRequest, hapiReply) {
    return new Promise((resolve, reject) => {
      app.render(hapiRequest.raw.req, hapiRequest.raw.res, pathName, hapiRequest.query, opts)
        .catch(error => {
          reject(error)
        })
        .then(() => {
          return hapiReply(new Readable().wrap(hapiRequest.raw.res))
        })
    })
  }
}

function defaultHandlerWrapper (app) {
  return function (hapiRequest, hapiReply) {
    return new Promise((resolve, reject) => {
      app.run(hapiRequest.raw.req, hapiRequest.raw.res)
        .catch(error => {
          reject(error)
        })
        .then(() => {
          return hapiReply(new Readable().wrap(hapiRequest.raw.res))
        })
    })
  }
}

module.exports = {
  pathWrapper,
  defaultHandlerWrapper
}
