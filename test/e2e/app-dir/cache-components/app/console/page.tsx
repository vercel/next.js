export default function ConsolePage() {
  console.info('/console: template(one: %s, two: %s)', 'one', 'two')
  console.log('/console: This is a console page')
  console.warn('/console: not a template', { foo: 'just-some-object' })
  console.error(new Error('/console: test'))
  console.assert(
    false,
    '/console: This is an assert message with a %s',
    'template'
  )
  console.assert(true, '/console: This is an assert message without a template')
  return null
}
