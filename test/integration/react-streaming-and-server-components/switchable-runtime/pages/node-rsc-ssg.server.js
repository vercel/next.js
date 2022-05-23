import Runtime from '../utils/runtime'
import Time from '../utils/time'

export default function Page({ type }) {
  return (
    <div className="node-rsc-ssg">
      This is a {type} RSC page.
      <br />
      <Runtime />
      <br />
      <Time />
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
