export default function Pid({ router }) {
  return <div>{`query: ${router.query.dynamic}`}</div>
}

export const config = {
  runtime: 'edge',
}
