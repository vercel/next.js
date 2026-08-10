import { foo } from 'external-package'
import { bar } from 'opted-out-external-package'
export async function getServerSideProps() {
  return {
    props: {
      foo,
      bar,
    },
  }
}

export default function Index({ foo }) {
  return (
    <div>
      {foo}
      {bar}
    </div>
  )
}
