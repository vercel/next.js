import path from 'path'
import mkdirp from 'mkdirp'
import fs from 'fs'

let inspector
try {
  // eslint-disable-next-line node/no-unsupported-features/node-builtins
  inspector = require('inspector')
} catch (e) {
  console.log('Unable to CPU profile in < node 8.0')
}

class Profiler {
  constructor (inspector) {
    this.session = undefined
    this.inspector = inspector
  }

  hasSession () {
    return this.session !== undefined
  }

  startProfiling () {
    if (this.inspector === undefined) {
      return Promise.resolve()
    }

    try {
      this.session = new inspector.Session()
      this.session.connect()
    } catch (_) {
      this.session = undefined
      return Promise.resolve()
    }

    return Promise.all([
      this.sendCommand('Profiler.setSamplingInterval', {
        interval: 100
      }),
      this.sendCommand('Profiler.enable'),
      this.sendCommand('Profiler.start')
    ])
  }

  sendCommand (method, params) {
    if (this.hasSession()) {
      return new Promise((resolve, reject) => {
        return this.session.post(method, params, (err, params) => {
          if (err !== null) {
            reject(err)
          } else {
            resolve(params)
          }
        })
      })
    } else {
      return Promise.resolve()
    }
  }

  destroy () {
    if (this.hasSession()) {
      this.session.disconnect()
    }

    return Promise.resolve()
  }

  stopProfiling () {
    return this.sendCommand('Profiler.stop')
  }
}

const { Tracer } = require('chrome-trace-event')

/**
 * an object that wraps Tracer and Profiler with a counter
 * @typedef {Object} Trace
 * @property {Tracer} trace instance of Tracer
 * @property {number} counter Counter
 * @property {Profiler} profiler instance of Profiler
 * @property {Function} end the end function
 */

/**
 * @param {string} outputPath The location where to write the log.
 * @returns {Trace} The trace object
 */
export const createTrace = outputPath => {
  const trace = new Tracer({
    noStream: true
  })
  const profiler = new Profiler(inspector)
  if (/\/|\\/.test(outputPath)) {
    const dirPath = path.dirname(outputPath)
    mkdirp.sync(dirPath)
  }
  const fsStream = fs.createWriteStream(outputPath)

  let counter = 0

  trace.pipe(fsStream)
  // These are critical events that need to be inserted so that tools like
  // chrome dev tools can load the profile.
  trace.instantEvent({
    name: 'TracingStartedInPage',
    id: ++counter,
    cat: ['disabled-by-default-devtools.timeline'],
    args: {
      data: {
        sessionId: '-1',
        page: '0xfff',
        frames: [
          {
            frame: '0xfff',
            url: 'webpack',
            name: ''
          }
        ]
      }
    }
  })

  trace.instantEvent({
    name: 'TracingStartedInBrowser',
    id: ++counter,
    cat: ['disabled-by-default-devtools.timeline'],
    args: {
      data: {
        sessionId: '-1'
      }
    }
  })

  return {
    trace,
    counter,
    profiler,
    end: callback => {
      // Wait until the write stream finishes.
      fsStream.on('finish', () => {
        callback()
      })
      // Tear down the readable trace stream.
      trace.push(null)
    }
  }
}
