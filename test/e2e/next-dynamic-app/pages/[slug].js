import { Render } from '../lib/registry'

export default function Page() {
  return <Render name="list" />
}

export const getServerSideProps = () => ({ props: {} })
