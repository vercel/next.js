export const runtime = undefined
export const maxDuration = undefined
export const config = { runtime: 'nodejs', maxDuration: 20 }

export function getServerSideProps() {
  return { props: { runtime: process.env.NEXT_RUNTIME } }
}

export default function Page({ runtime }) {
  return <p id="runtime">{runtime}</p>
}
