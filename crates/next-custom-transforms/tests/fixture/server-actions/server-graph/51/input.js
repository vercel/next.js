'use cache'

// FIXME: this produces incorrect output, with
//
//   Object.defineProperty($$RSC_SERVER_ACTION_0, ...)
//
// where `$$RSC_SERVER_ACTION_0` doesn't exist.
// but why is typescript not complaining about an undefined variable there?
export default async function (a, b, c) {
  'use server'

  return (
    <div>
      {a}
      {b}
      {c}
    </div>
  )
}

export async function foo(a, b) {
  'use server'

  return (
    <div>
      {a}
      {b}
    </div>
  )
}

export const bar = async (a, b) => {
  'use server'

  return (
    <div>
      {a}
      {b}
    </div>
  )
}
