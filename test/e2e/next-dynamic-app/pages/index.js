import { Render } from '../lib/registry'
import { TEXT } from '../lib/text'

export default function Page() {
  return (
    <>
      <h1>{TEXT}</h1>
      <Render name="list" />
    </>
  )
}

export const getServerSideProps = () => ({ props: {} })
