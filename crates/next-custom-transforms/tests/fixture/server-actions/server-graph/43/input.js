import { Foo } from './client'

const secret = 'my password is qwerty123'

async function getCachedRandom(x, children) {
  'use cache'
  return {
    x,
    y: Math.random(),
    z: (
      <Foo
        action={async () => {
          'use server'

          console.log(secret, x)
        }}
      />
    ),
    r: children,
  }
}
