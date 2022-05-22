import Runtime from '../utils/runtime'
import Time from '../utils/time'

export default function Page({ type }) {
  return (
    <div>
      This is a {type} page.
      <br />
      <Runtime />
      <br />
      <Time />
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
