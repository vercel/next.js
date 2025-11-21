export function generateStaticParams() {
  return [{ bottom: 'prerendered' }]
}

export default async function Page(props: {
  params: Promise<{ top: string; bottom: string }>
}) {
  return (
    <p>
      Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
    </p>
  )
}
