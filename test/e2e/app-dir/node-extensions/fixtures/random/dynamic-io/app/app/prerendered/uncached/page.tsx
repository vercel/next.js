export default async function Page() {
  if (typeof process !== 'undefined') {
    // we delay the random calls to avoid triggering dynamic in other component trees
    await new Promise((r) => process.nextTick(r))
  }
  return (
    <ul>
      <li>
        <RandomValue />
      </li>
      <li>
        <RandomValue />
      </li>
    </ul>
  )
}

async function RandomValue() {
  return Math.random()
}
