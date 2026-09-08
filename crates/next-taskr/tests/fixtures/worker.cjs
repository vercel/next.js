const fs = require('fs')
const path = require('path')
const readline = require('readline')
let sequence = 0
let expiredArtifact
const pending = new Map()
const send = (message) =>
  process.stdout.write('__NEXT_TASKR__' + JSON.stringify(message) + '\n')
const call = (request, args) =>
  new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    send({ request, call: id, args })
  })
async function execute(message) {
  if (message.kind === 'shutdown') return null
  if (message.kind === 'transform') {
    fs.appendFileSync('transforms', 'x')
    if (message.args.files) {
      if (message.args.files.some((file) => 'artifact' in file))
        throw new Error('Transient handles reached the compiler or cache key')
      return {
        files: message.args.files,
        errors: [{ name: 'code', data: 'ZXJyb3I=' }],
      }
    }
    return message.args
  }
  if (message.kind !== 'task') throw new Error('Unknown operation')
  const name = message.args.name
  fs.appendFileSync('actions', name + '\n')
  if (name === 'release') {
    return call(message.id, {
      kind: 'tasks',
      names: ['clean', 'copy', 'verify'],
      options: {},
      parallel: false,
    })
  }
  if (name === 'clean') {
    fs.rmSync('dist', { recursive: true, force: true })
    return null
  }
  if (name === 'verify') {
    if (!fs.readFileSync('dist/file').equals(fs.readFileSync('input/file')))
      throw new Error('Consumer ran before producer')
    return null
  }
  if (name === 'crash') process.exit(2)
  if (name === 'expired') {
    return call(message.id, {
      kind: 'tasks',
      names: ['save_artifact', 'use_expired_artifact'],
      options: {},
      parallel: false,
    })
  }
  if (name === 'save_artifact') {
    ;[expiredArtifact] = await call(message.id, {
      kind: 'read',
      paths: [path.resolve('input/file')],
      artifacts: true,
    })
    return null
  }
  if (name === 'use_expired_artifact') {
    return call(message.id, {
      kind: 'write',
      files: [
        { path: path.resolve('dist/expired'), artifact: expiredArtifact },
      ],
    })
  }
  if (name === 'mutate') {
    const [artifact] = await call(message.id, {
      kind: 'read',
      paths: [path.resolve('input/file')],
      artifacts: true,
    })
    const [data] = await call(message.id, {
      kind: 'load',
      artifacts: [artifact],
    })
    const modified = Buffer.concat([
      Buffer.from(data, 'base64'),
      Buffer.from(' modified'),
    ])
    return call(message.id, {
      kind: 'write',
      files: [
        { path: path.resolve('dist/original'), artifact },
        {
          path: path.resolve('dist/modified'),
          data: modified.toString('base64'),
        },
      ],
    })
  }
  if (name === 'malformed') {
    process.stdout.write('__NEXT_TASKR__{broken\n')
    return new Promise(() => {})
  }
  if (name === 'cycle') {
    return call(message.id, {
      kind: 'tasks',
      names: ['cycle'],
      options: {},
      parallel: false,
    })
  }
  if (name === 'all') {
    return call(message.id, {
      kind: 'tasks',
      names: ['copy', 'copy'],
      options: {},
      parallel: true,
    })
  }
  if (name === 'batch') {
    const [data, context] = await call(message.id, {
      kind: 'read',
      paths: [path.resolve('input/file'), path.resolve('input/context')],
    })
    const outputs = await call(message.id, {
      kind: 'transforms',
      inputs: [
        { data, context },
        { data: 'c2Vjb25k', context },
        { data, context },
      ],
    })
    return call(message.id, {
      kind: 'write',
      files: outputs.map((output, index) => ({
        path: path.resolve(`dist/batch-${index}`),
        data: output.data,
      })),
    })
  }
  if (name !== 'copy' && name !== 'watch')
    throw new Error('Unknown task: ' + name)
  const [artifact] = await call(message.id, {
    kind: 'read',
    artifacts: true,
    paths: [path.resolve('input/file')],
  })
  if (typeof artifact !== 'number')
    throw new Error('Source bytes reached the recipe')
  const input = { files: [{ dir: 'input', base: 'file', artifact }] }
  const outputs = await call(message.id, {
    kind: 'transforms',
    artifacts: true,
    inputs: [input, input],
  })
  if (outputs.length !== 2 || JSON.stringify(outputs).length > 1000)
    throw new Error('Cached contents reached the recipe')
  for (const output of outputs) {
    for (const file of [...output.files, ...output.errors]) {
      if ('data' in file || typeof file.artifact !== 'number')
        throw new Error('Expected artifact metadata without contents')
    }
  }
  await call(message.id, {
    kind: 'write',
    files: [
      {
        path: path.resolve('dist/file'),
        artifact: outputs[0].files[0].artifact,
      },
      {
        path: path.resolve('dist/second'),
        artifact: outputs[1].files[0].artifact,
      },
      {
        path: path.resolve('.errors/code'),
        artifact: outputs[0].errors[0].artifact,
      },
    ],
  })
  if (name === 'watch') {
    await call(message.id, {
      kind: 'watch',
      path: path.resolve('input'),
      names: ['copy'],
      options: {},
    })
  }
  return null
}
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (message.reply !== undefined) {
    const item = pending.get(message.reply)
    pending.delete(message.reply)
    if (message.error) item.reject(new Error(message.error))
    else item.resolve(message.value)
  } else {
    execute(message).then(
      (value) => send({ request: message.id, value }),
      (error) => send({ request: message.id, error: error.message })
    )
  }
})
