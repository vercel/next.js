import { load } from 'fake-native'

export function getServerSideProps() {
  return { props: { binding: load() } }
}

export default function Page({ binding }) {
  return <p>{binding}</p>
}
