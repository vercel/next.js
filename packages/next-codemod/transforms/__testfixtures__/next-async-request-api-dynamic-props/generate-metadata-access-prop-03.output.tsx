type MetadataProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata(props: MetadataProps) {
  return {
    title: (await props.params).slug,
  };
}
