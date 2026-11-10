import { Form } from './form'
import { getSentinelValue } from '../getSentinelValue'

export default function Page() {
  const simpleValue = 'result'
  // JSX has debug info, which affects the serialized result
  const jsxValue = <span>and more</span>
  // Async components emit timing chunks
  const timedValue = <HasTimingInfo />
  return (
    <>
      <Form
        action={async () => {
          'use server'
          return (
            <>
              {simpleValue} {jsxValue} {timedValue}
            </>
          )
        }}
      />
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

async function HasTimingInfo() {
  await Promise.resolve()
  return 'and even more'
}
