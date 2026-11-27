import defer * as client from './counter'

export default function Page() {
  // A deferred import of a client component module from a server component.
  return <client.Counter label="deferred client component" />
}
