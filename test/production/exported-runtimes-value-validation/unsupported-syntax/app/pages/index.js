export default function Page() {
  return <p>hello world</p>
}

export const config = {
  runtime: `something-${'real' + 1 + 'y odd'}`,
}
