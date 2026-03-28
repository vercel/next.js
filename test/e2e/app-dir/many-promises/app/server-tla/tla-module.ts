let result = ''

const p = Promise.resolve()
for (let i = 0; i < 2 ** 24; i++) {
  await p
}

result = 'done'

export { result }
