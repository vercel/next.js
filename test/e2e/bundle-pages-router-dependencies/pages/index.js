import { foo } from 'external-package'
import { bar } from 'opted-out-external-package'

export async function getServerSideProps() {
  return {
    props: {
      foo: foo(),
      bar: bar(),
      fooFn: foo.toString(),
      barFn: bar.toString(),
    },
  }
}

export default function Index({ foo, bar, fooFn, barFn }) {
  return (
    <div>
      {`${foo} and ${bar}`}
      {`${fooFn} and ${barFn}`}
    </div>
  )
}
