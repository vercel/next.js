import { ClientComponent } from './client'

export default async function Page() {
  const cycle = { self: null as unknown }
  cycle.self = cycle

  return <ClientComponent testProp={cycle} />
}
