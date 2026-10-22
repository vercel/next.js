export const runtime = 'nodejs'
export const maxDuration = 0
export const config = { runtime: 'experimental-edge', maxDuration: 20 }

export function getServerSideProps() {
  return { props: { runtime: process.env.NEXT_RUNTIME } }
}

export default function Page({ runtime }) {
  return <p id="runtime">{runtime}</p>
}
