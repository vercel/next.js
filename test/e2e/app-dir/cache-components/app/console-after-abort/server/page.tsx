import { headers } from 'next/headers'

async function cachedConsoleCalls(outBadge: string, errBadge: string) {
  'use cache'
  console.info(`${outBadge} /console: template(one: %s, two: %s)`, 'one', 'two')
  console.log(
    // eslint-disable-next-line no-useless-concat
    `${outBadge} /console: This is a console page` +
      ". Don't match the codeframe."
  )
  console.warn(`${errBadge} /console: not a template`, {
    foo: 'just-some-object',
  })
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

  console.log(`${outBadge} logging before trying await headers()`)
  try {
    await headers()
  } catch (error) {
    console.error(`${errBadge} caught error trying await headers()`)
  }
  // We add some delay because in tests this sometimes runs after the second render pass
  // has already started and that can lead to out-of-order console logs.
  console.info(`${outBadge} /console: template(one: %s, two: %s)`, 'one', 'two')
  console.log(
    // eslint-disable-next-line no-useless-concat
    `${outBadge} /console: This is a console page` +
      ". Don't match the codeframe."
  )
  console.warn(`${errBadge} /console: not a template`, {
    foo: 'just-some-object',
  })
  console.error(new Error(`${errBadge} /console: test`))
  console.assert(
    false,
    `${errBadge} /console: This is an assert message with a %s`,
    'template'
  )
  console.assert(
    true,
    `${errBadge} /console: This is an assert message without a template`
  )

  await cachedConsoleCalls(outBadge, errBadge)

  return null
}
