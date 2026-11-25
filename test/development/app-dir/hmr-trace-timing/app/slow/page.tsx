export default async function SlowPage() {
  // Give the e2e trace assertion a known lower bound in microseconds.
  await new Promise((resolve) => setTimeout(resolve, 200))
  return <p>slow page</p>
}
