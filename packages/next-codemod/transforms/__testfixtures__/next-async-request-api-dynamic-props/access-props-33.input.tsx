function useHook() {}

export default function Page({ params }: { params: { slug: string } }) {
  useHook()
  return <p>child {params.slug}</p>
}
