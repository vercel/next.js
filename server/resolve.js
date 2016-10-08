import _resolve from 'resolve'

export default function resolve (id, opts) {
  return new Promise((resolve, reject) => {
    _resolve(id, opts, (err, path) => {
      if (err) {
        const e = new Error(err)
        e.code = 'ENOENT'
        return reject(e)
      }
      resolve(path)
    })
  })
}

