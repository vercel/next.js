'use server'

// Should be 0 111000 0, which is "70" in hex.
export async function action(a, b, c) {
  return (
    <div>
      {a}
      {b}
      {c}
    </div>
  )
}

// Should be 0 111111 1, which is "7f" in hex.
export default async function action2(a, b, ...c) {
  return (
    <div>
      {a}
      {b}
      {c}
    </div>
  )
}

// Should be 0 111111 1, which is "60" in hex.
export async function action3(a, b) {
  'use server'
  return (
    <div>
      {a}
      {b}
    </div>
  )
}

// Should be 1 110000 0, which is "e0" in hex.
export async function cache(a, b) {
  'use cache'
  return (
    <div>
      {a}
      {b}
    </div>
  )
}
