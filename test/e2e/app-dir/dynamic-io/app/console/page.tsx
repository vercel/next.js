export default function ConsolePage() {
  console.info('template(one: %s, two: %s)', 'one', 'two')
  console.log('This is a console page')
  console.warn('not a template', { foo: 'just-some-object' })
  console.error(new Error('test'))
  console.assert(false, 'This is an assert message with a %s', 'template')
  console.assert(true, 'This is an assert message without a template')
  return null
}
