export async function Component(a) {
  const b = 1

  return (
    <Client
      // Should be 1 110000 0, which is "e0" in hex (counts as two params,
      // because of the encrypted bound args param)
      fn1={async (c) => {
        'use cache'

        return a + b + c
      }}
      // Should be 1 100000 0, which is "c0" in hex (counts as one param,
      // because of the encrypted bound args param)
      fn2={async function () {
        'use cache'

        return a + b
      }}
      // Should be 0 110000 0, which is "60" in hex (counts as two params,
      // because of the encrypted bound args param)
      fn3={async (c) => {
        'use server'

        return a + b + c
      }}
      // Should be 0 100000 0, which is "40" in hex (counts as one param,
      // because of the encrypted bound args param)
      fn4={async function () {
        'use server'

        return a + b
      }}
    />
  )
}
