type PageProps = {
  params: { slug: string }
}

export default async function Page(props: PageProps) {
  const params = (await props.params)
  return <p>child {params.slug}</p>
}
