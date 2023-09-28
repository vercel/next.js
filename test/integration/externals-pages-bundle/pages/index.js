import { foo } from 'external-package'

export async function getServerSideProps() {
  return {
    props: {
      foo,
    },
  }
}

export default function Index({ foo }) {
  return <div>{foo}</div>
}
