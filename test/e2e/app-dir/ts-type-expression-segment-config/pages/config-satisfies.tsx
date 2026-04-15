export const config = { runtime: 'experimental-edge' } satisfies {
  runtime: string
}

export default function Page() {
  return <p id="runtime">{process.env.NEXT_RUNTIME}</p>
}
