type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function Page(props: PageProps) {
  const params = (await props.params)
  return <p>child {params.slug}</p>
}

type MetadataProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata(props: MetadataProps) {
  return {
    title: (await props.params).slug,
  };
}
