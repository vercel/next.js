interface PageProps {
  params: Promise<{
    id: string
    name: string
  }>
}

export default async function Page(props: PageProps) {
  const params = await props.params;

  const {
    id,
    name
  } = params;

  globalThis.f1(id)
  globalThis.f2(name)
}
