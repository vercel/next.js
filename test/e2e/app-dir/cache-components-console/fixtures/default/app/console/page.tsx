async function cachedConsoleCalls(outBadge: string, errBadge: string) {
  'use cache'
  console.info(`${outBadge} /console: template(one: %s, two: %s)`, 'one', 'two')
  await 1
  console.log(
    `${outBadge} /console: This is a console page` +
      ". Don't match the codeframe."
  )
  await 1
  console.warn(`${errBadge} /console: not a template`, {
    foo: 'just-some-object',
  })
  await 1
  // TODO(veil): Assert on inspected errors once we sourcemap errors replayed from Cache environment.
  // console.error(new Error('/console: test'))
  console.assert(
    false,
    `${errBadge} /console: This is an assert message with a %s`,
    'template'
  )
  console.assert(
    true,
    `${errBadge} /console: This is an assert message without a template`
  )
}

let i = 0
export default async function ConsolePage() {
  const outBadge = `:::${i}:out:::`
  const errBadge = `:::${i++}:err:::`
  console.info(`${outBadge} /console: template(one: %s, two: %s)`, 'one', 'two')
  await 1
  console.log(
    `${outBadge} /console: This is a console page` +
      ". Don't match the codeframe."
  )
  await 1
  console.warn(`${errBadge} /console: not a template`, {
    foo: 'just-some-object',
  })
  await 1
  console.error(new Error(`${errBadge} /console: test`))
  await 1
  console.assert(
    false,
    `${errBadge} /console: This is an assert message with a %s`,
    'template'
  )
  console.assert(
    true,
    `${errBadge} /console: This is an assert message without a template`
  )

  await 1
  await cachedConsoleCalls(outBadge, errBadge)

  return null
}
