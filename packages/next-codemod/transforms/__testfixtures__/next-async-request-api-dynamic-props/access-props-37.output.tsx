export default async function Page(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  foo.useFakeTimers()
  return <p>child {params.slug}</p>
}
