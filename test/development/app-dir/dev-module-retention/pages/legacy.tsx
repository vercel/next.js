import { revision } from '../lib/version'

export default function Page({ value }: { value: string }) {
  return <p>{value}</p>
}

export function getServerSideProps() {
  return { props: { value: revision } }
}
