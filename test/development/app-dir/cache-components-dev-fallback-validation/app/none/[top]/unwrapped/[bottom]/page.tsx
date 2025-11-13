export default async function Page(props: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const location = '/none/[top]/unwrapped/[bottom]/page.tsx'
  process.stdout.write(`${location} :: awaiting params\n`)
  using _ = {
    async [Symbol.dispose]() {
      process.stdout.write(`${location} :: finished awaiting params\n`)
    },
  }
  return (
    <p>
      Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
    </p>
  )
}
