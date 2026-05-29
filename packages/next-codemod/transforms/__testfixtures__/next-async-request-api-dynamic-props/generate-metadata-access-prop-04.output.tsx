type MetadataProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata(props: MetadataProps): Promise<ResolvedMetadata> {
  return {
    title: (await props.params).slug,
  };
}
