import { cookies, draftMode } from 'next/headers'
import { Button } from './button'

async function getCachedValue(
  iterable: Iterable<number>,
  fn: () => string
): Promise<[string, () => string]> {
  'use cache'

  // Make sure we're always receiving the arguments the same way, regardless of
  // whether draft mode is enabled or not. We're asserting that by checking
  // whether an iterable was serialized/deserialized into an array by React.
  if (!Array.isArray(iterable)) {
    throw new Error(
      'Expected iterable to be serialized to an array because it crossed the "use cache" boundary.'
    )
  }

  const date = new Date()
  date.setFullYear(date.getFullYear() + iterable.reduce((sum, n) => sum + n))

  return [date.toISOString(), fn]
}

export default async function Page({
  params,
}: {
  params: Promise<{ mode: string }>
}) {
  'use cache'

  const { mode } = await params
  const offset = 1000

  const cachedClosure = async () => {
    'use cache'
    return new Date(Date.now() + offset).toISOString()
  }

  const { isEnabled } = await draftMode()

  // Accessing request-scoped data in "use cache" should not be allowed, even if
  // draft mode is enabled. We expect the access to throw.
  if (isEnabled && mode === 'with-cookies') {
    await cookies()
  }

  const [cachedValue, passthroughFn] = await getCachedValue(
    {
      [Symbol.iterator]: function* () {
        yield 1
        yield 2
        yield 3
      },
    },
    () => 'value from passed-through function'
  )

  return (
    <form
      action={async () => {
        'use server'
        const draft = await draftMode()
        if (draft.isEnabled) {
          draft.disable()
        } else {
          draft.enable()
        }
      }}
    >
      <p id="top-level">{cachedValue}</p>
      <p id="closure">{await cachedClosure()}</p>
      <p>{passthroughFn()}</p>
      <Button id="toggle">{isEnabled ? 'Disable' : 'Enable'} Draft Mode</Button>
    </form>
  )
}

export function generateStaticParams() {
  return [{ mode: 'with-cookies' }, { mode: 'without-cookies' }]
}
