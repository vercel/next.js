'use server'

export default async (a, b, c) => {
  'use cache'

  return (
    <div>
      {a}
      {b}
      {c}
    </div>
  )
}
