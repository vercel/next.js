'use server'

export default async function (a, b, c) {
  'use cache'

  return (
    <div>
      {a}
      {b}
      {c}
    </div>
  )
}
