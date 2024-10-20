type PageProps = {
  params: { slug: string }
}

export default function Page(props: PageProps) {
  const params = props.params
  return <p>child {params.slug}</p>
}

type MetadataProps = {
  params: { slug: string }
}

export function generateMetadata(props: MetadataProps) {
  return {
    title: props.params.slug,
  }
}
