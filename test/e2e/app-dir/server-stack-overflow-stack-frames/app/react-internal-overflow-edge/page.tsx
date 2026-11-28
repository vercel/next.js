export const runtime = 'edge'

function Recursive() {
  return <Recursive />
}

export default function Page() {
  return <Recursive />
}
