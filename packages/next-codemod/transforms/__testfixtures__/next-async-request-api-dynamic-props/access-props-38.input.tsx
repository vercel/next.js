type PageProps = {
  params: { slug: string }
}

export default function Page(props: PageProps) {
  const params = props.params
  return <p>child {params.slug}</p>
}

