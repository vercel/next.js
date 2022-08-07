export default function Page() {
  return <p>hello world</p>
}

const runtime = Symbol('runtime')

export const config = {
  runtime: runtime,
}
