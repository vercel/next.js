import { Button } from 'components'

const secret = 'my password is qwerty123'

async function getCachedRandom(x, children) {
  'use cache'
  return {
    x,
    y: Math.random(),
    z: (
      <Button
        action={async () => {
          'use server'

          console.log(secret, x)
        }}
      />
    ),
    r: children,
  }
}
