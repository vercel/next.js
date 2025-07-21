async function cachedConsoleCalls() {
  'use cache'
  console.info('/console: template(one: %s, two: %s)', 'one', 'two')
  console.log(
    // eslint-disable-next-line no-useless-concat
    '/console: This is a console page' + ". Don't match the codeframe."
  )
  console.warn('/console: not a template', { foo: 'just-some-object' })
  // TODO(veil): Assert on inspected errors once we sourcemap errors replayed from Cache environment.
  // console.error(new Error('/console: test'))
  console.assert(
    false,
    '/console: This is an assert message with a %s',
    'template'
  )
  console.assert(true, '/console: This is an assert message without a template')
}

export default async function ConsolePage() {
  console.info('/console: template(one: %s, two: %s)', 'one', 'two')
  console.log(
    // eslint-disable-next-line no-useless-concat
    '/console: This is a console page' + ". Don't match the codeframe."
  )
  console.warn('/console: not a template', { foo: 'just-some-object' })
  console.error(new Error('/console: test'))
  console.assert(
    false,
    '/console: This is an assert message with a %s',
    'template'
  )
  console.assert(true, '/console: This is an assert message without a template')

  await cachedConsoleCalls()

  return null
}
