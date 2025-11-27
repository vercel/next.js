const path = require('path')

module.exports = async function (content) {
  let dir = path.dirname(this.resourcePath)

  let read1 = await new Promise((res, rej) =>
    this.fs.readFile(path.join(dir, 'test.txt'), (err, data) => {
      if (err) return rej(err)
      res(data)
    })
  )
  let read2 = await new Promise((res, rej) =>
    this.fs.readFile(path.join(dir, 'test.txt'), 'utf8', (err, data) => {
      if (err) return rej(err)
      res(data)
    })
  )
  let read3 = await new Promise((res, rej) =>
    this.fs.readFile(path.join(dir, 'test.mp4'), (err, data) => {
      if (err) return rej(err)
      res(data)
    })
  )
  return `module.exports = "Buffer read: ${read1 instanceof Buffer ? read1.length : 0}, string read: '${read2.trim()}', binary read: ${read3.length}"`
}
