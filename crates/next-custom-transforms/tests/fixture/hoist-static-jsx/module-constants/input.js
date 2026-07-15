import { Badge } from './badge'

const TITLE = 'Hello'
const SIZE = 16

export function Header() {
  return (
    <header>
      <Badge
        title={TITLE}
        size={SIZE}
        aria-hidden={true}
        label={undefined}
        items={['a', 'b']}
        config={{ nested: { deep: true } }}
      />
      <Badge title={`literal`} />
    </header>
  )
}
