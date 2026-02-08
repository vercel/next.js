export const revalidate = 0

let hasThrown = false

export default function Page() {
  if (!hasThrown) {
    hasThrown = true
    throw new Error('this is a test')
  }

  return <p id="recover">Recovered</p>
}
