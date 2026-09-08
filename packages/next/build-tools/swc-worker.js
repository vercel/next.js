const fs = require('fs')
const transform = require('./swc')

process.on('message', async (input) => {
  try {
    if (input.errors !== undefined)
      fs.writeFileSync('errors.json', input.errors)
    fs.rmSync('.errors', { recursive: true, force: true })
    // All files share immutable WASI inputs. Wait for every native transform,
    // including on failure, before the next batch can clear its artifacts.
    const results = await Promise.allSettled(
      input.files.map(async (inputFile) => {
        const file = {
          ...inputFile,
          data:
            inputFile.data === null
              ? null
              : Buffer.from(inputFile.data, 'base64'),
        }
        const context = { _: { files: [file] } }
        await transform.call(context, file, ...input.options)
        return context._.files
      })
    )
    const failed = results.find((result) => result.status === 'rejected')
    if (failed) throw failed.reason
    let errors = []
    try {
      errors = fs
        .readdirSync('.errors')
        .sort()
        .map((name) => ({
          name,
          data: fs.readFileSync('.errors/' + name).toString('base64'),
        }))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    process.send({
      value: {
        files: results
          .flatMap((result) => result.value)
          .map((file) => ({
            ...file,
            data: file.data.toString('base64'),
          })),
        errors,
      },
    })
  } catch (error) {
    process.send({ error: error.stack || error.message })
  }
})

process.on('disconnect', () => process.exit(0))
