globalThis.fetch = async () => {
  process.stderr.write('Unexpected agent feedback network request\n')
  throw new Error('Unexpected agent feedback network request')
}
