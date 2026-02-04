function useHook() {}

function Child() {
  useHook()
  return <p>child</p>
}

export default async function Page(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  return (
    <div>
      <Child />
      <p>child {params.slug}</p>
    </div>
  )
}
