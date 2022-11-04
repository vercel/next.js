export default function Page() {
  return <p>Hello from edge page</p>
}

export const config = {
  runtime: 'experimental-edge',
}
