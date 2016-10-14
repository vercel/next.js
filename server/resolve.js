import _resolve from 'resolve'

export default function resolve (id, opts) {
  return new Promise((resolve, reject) => {
    _resolve(id, opts, (err, path) => {
      if (err) {
        err.code = 'ENOENT'
        return reject(err)
      }
      resolve(path)
    })
  })
}

