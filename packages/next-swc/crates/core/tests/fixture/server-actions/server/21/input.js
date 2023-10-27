import { validator, another } from 'auth'

const x = 1

export default function Page() {
  const y = 1
  return (
    <Foo
      action={validator(async function (z) {
        'use server'
        return x + y + z
      })}
    />
  )
}

validator(async () => {
  'use server'
})

another(
  validator(async () => {
    'use server'
  })
)
