import Cluster from 'cluster'

let callback
let worker

if (Cluster.isMaster) {
  Cluster.setupMaster({
    exec: require.resolve('./worker'),
    // Avoid issues while debugging parent
    execArgv: []
  })
  worker = Cluster.fork()
  worker.on('message', (msg) => {
    if (!callback) {
      console.error('Message without callback', msg)
      return
    }

    if (msg.cmd === 'error') {
      const toThrow = new Error(msg.message)
      toThrow.stack = msg.stack
      callback(toThrow)
    } else {
      callback(null, msg)
    }
  })
  worker.on('error', (err) => {
    console.error('Babel worker errored', err)
    if (callback) {
      callback(err)
    }
  })
  worker.on('exit', () => {
    console.error('Babel worker exited')
  })
}

export function build (filenames, options) {
  return new Promise((resolve, reject) => {
    worker.send({cmd: 'build', filenames, options})
    callback = (err, msg) => {
      if (err) {
        reject(err)
      } else if (msg.cmd === 'built') {
        Cluster.disconnect()
        resolve(msg)
      }
    }
  })
}

export function watch (filenames, options, fileCallback) {
  return new Promise((resolve, reject) => {
    worker.send({cmd: 'watch', filenames, options})
    callback = (err, msg) => {
      if (err) {
        reject(err)
      } else if (msg.cmd === 'built') {
        resolve(msg)
      } else if (fileCallback) {
        fileCallback(msg)
      }
    }
  })
}
