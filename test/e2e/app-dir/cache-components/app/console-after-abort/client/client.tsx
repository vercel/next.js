'use client'

import { use } from 'react'

function log(outBadge: string, errBadge: string) {
  console.info(`${outBadge} /console: template(one: %s, two: %s)`, 'one', 'two')
  console.log(
    // eslint-disable-next-line no-useless-concat
    `${outBadge} /console: This is a console page. Don't match the codeframe.`
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
}

export default function ClientConsolePage({
  data,
  outBadge,
  errBadge,
}: {
  data: Promise<any>
  outBadge: string
  errBadge: string
}) {
  console.log(`${outBadge} logging before prerender aborts in client component`)
  setTimeout(log.bind(null, outBadge, errBadge), 1)

  use(data)

  return null
}
