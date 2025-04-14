import { foo } from 'bundled-package'
import { bar } from 'external-package'

export async function getServerSideProps() {
  return {
    props: {
      foo: foo(),
      bar: bar(),
    },
  }
}

export default function Index({ foo, bar }) {
  return (
    <div>
      <span id="bundled">{foo}</span>
      <span id="external">{bar}</span>
    </div>
  )
}
