import { Badge } from './badge'

const CONFIG = { compact: true }

export function Panel() {
  return (
    <section>
      <Badge items={['a', 'b']} />
      <Badge config={{ compact: true }} />
      <Badge config={CONFIG} />
      <Badge>
        <em>one</em>
      </Badge>
      <Badge>
        <em>one</em>
        <em>two</em>
      </Badge>
      <div style={{ width: 100 }} />
    </section>
  )
}
