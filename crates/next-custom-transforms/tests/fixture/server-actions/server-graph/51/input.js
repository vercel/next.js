'use cache'

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
