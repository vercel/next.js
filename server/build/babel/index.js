import Cluster from 'cluster'

let callbacks = [];
let worker

if (Cluster.isMaster) {
  Cluster.setupMaster({
    exec: require.resolve('./worker'),
    // Avoid issues while debugging parent
    execArgv: []
  })
  worker = Cluster.fork()
  worker.on('message', (msg) => {
    const callback = callbacks[msg.callbackId]
    if (!callback) {
      throw new Error(`Message without callback: ${JSON.stringify(msg, undefined, 2)}`);
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
    throw new Error('Worker error');
  })
  worker.on('exit', () => {
    console.error('Babel worker exited')
  })
}

export function build (filenames, options) {
  return new Promise((resolve, reject) => {
    const callbackId = callbacks.length
    callbacks.push((err, msg) => {
      if (err) {
        reject(err)
      } else if (msg.cmd === 'built') {
        Cluster.disconnect()
        resolve(msg)
      }
    })

    worker.send({callbackId, cmd: 'build', filenames, options})
  })
}

export function watch (filenames, options, fileCallback) {
  return new Promise((resolve, reject) => {
    const callbackId = callbacks.length
    callbacks.push((err, msg) => {
      if (err) {
        reject(err)
      } else if (msg.cmd === 'built') {
        resolve(msg)
      } else if (fileCallback) {
        fileCallback(msg)
      }
    })

    worker.send({callbackId, cmd: 'watch', filenames, options})
  })
}
