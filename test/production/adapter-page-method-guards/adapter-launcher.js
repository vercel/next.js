// Mimics how deployment platforms invoke a build output through an adapter.
// It reads the outputs passed to the adapter's `onBuildComplete` and calls the
// `handler` export of one Node.js output's entrypoint directly, with
// minimal-mode request metadata. No NextServer is involved, so any request
// validation has to happen in the entrypoint itself.
//
// The entrypoint is loaded from its build location rather than from a copy of
// its traced assets: this suite is about the handler's behavior, not about
// output tracing.
//
// Usage: node adapter-launcher.js <outputs key>:<pathname>
//   e.g. node adapter-launcher.js appPages:/dynamic
//
// Request headers used by the test:
// - `x-test-request-id`: echoed in a log line once the handler has finished,
//   so the test can wait for all logs produced by the request.
// - `x-test-preset-status`: emulates callers that set the status before
//   invoking an error page.
const fs = require('fs')
const http = require('http')
const path = require('path')

const outputId = process.argv[2]
const separator = outputId.indexOf(':')
const outputsKey = outputId.slice(0, separator)
const pathname = outputId.slice(separator + 1)

const { outputs, projectDir, repoRoot } = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'build-complete.json'), 'utf8')
)
const output = outputs[outputsKey].find(
  (item) => item.pathname === pathname && item.runtime === 'nodejs'
)
if (!output) {
  throw new Error(`No Node.js output found for ${outputId}`)
}

process.chdir(repoRoot)
const relativeProjectDir = path.relative(repoRoot, projectDir) || '.'
require('next/dist/build/adapter/setup-node-env.external')
const { handler } = require(output.filePath)

http
  .createServer((req, res) => {
    const presetStatus = req.headers['x-test-preset-status']
    if (typeof presetStatus === 'string') {
      res.statusCode = Number(presetStatus)
    }

    Promise.resolve()
      .then(() =>
        handler(req, res, {
          waitUntil: undefined,
          requestMeta: {
            minimalMode: true,
            relativeProjectDir,
            initURL: `https://localhost${req.url}`,
          },
        })
      )
      .catch((err) => {
        console.error('handler error', err)
        if (!res.writableEnded) {
          res.statusCode = 500
          res.end('internal error')
        }
      })
      .finally(() => {
        console.log(`__request-done__ ${req.headers['x-test-request-id']}`)
      })
  })
  .listen(Number(process.env.PORT), () =>
    console.log(`adapter launcher ready: ${outputId}`)
  )
