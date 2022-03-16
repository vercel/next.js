import getRuntime from '../utils/runtime'
import getTime from '../utils/time'

export default function Page({ type }) {
  return (
    <div>
      This is a {type} page.
      <br />
      {'Runtime: ' + getRuntime()}
      <br />
      {'Time: ' + getTime()}
    </div>
  )
}

export function getServerSideProps() {
  return {
    props: {
      type: 'SSR',
    },
  }
}

export const config = {
  runtime: 'nodejs',
}
