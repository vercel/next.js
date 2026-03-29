let result = ''

const p = Promise.resolve()
const t0 = Date.now()
for (let chunk = 0; chunk < 2 ** 4; chunk++) {
  await new Promise((resolve) => setImmediate(resolve))
  const chunkStart = Date.now()
  for (let i = 0; i < 2 ** 16; i++) {
    await p
  }
  console.log(
    `[server-tla] chunk ${chunk}: ${Date.now() - chunkStart}ms (total: ${Date.now() - t0}ms)`
  )
}

result = 'done'

export { result }
