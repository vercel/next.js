import getRuntime from '../utils/runtime'
import getTime from '../utils/time'

export default function Page({ type }) {
  return (
    <div>
      This is a {type} RSC page.
      <br />
      {'Runtime: ' + getRuntime()}
      <br />
      {'Time: ' + getTime()}
    </div>
  )
}

export function getStaticProps() {
  return {
    props: {
      type: 'SSG',
    },
  }
}

export const config = {
  runtime: 'nodejs',
}
