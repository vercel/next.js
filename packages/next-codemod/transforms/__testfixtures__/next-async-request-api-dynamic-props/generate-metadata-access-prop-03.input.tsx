type MetadataProps = {
  params: { slug: string }
}

export function generateMetadata(props: MetadataProps) {
  return {
    title: props.params.slug,
  }
}
