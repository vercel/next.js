export default function Index() {
  if (typeof window !== 'undefined') {
    window.didHydrate = true
  }
  return <p>Hello</p>
}
