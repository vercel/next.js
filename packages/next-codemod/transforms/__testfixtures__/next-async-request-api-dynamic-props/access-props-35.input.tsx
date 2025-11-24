function useHook() {}

function Child() {
  useHook()
  return <p>child</p>
}

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <div>
      <Child />
      <p>child {params.slug}</p>
    </div>
  )
}
