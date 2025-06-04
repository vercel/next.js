type MetadataProps = {
  params: { slug: string }
}

export async function generateMetadata(props: MetadataProps): Promise<ResolvedMetadata> {
  return {
    title: props.params.slug,
  }
}
