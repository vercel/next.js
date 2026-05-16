export default function Page() {
  return 'merge'
}

export async function generateMetadata(props, parentResolvingMetadata) {
  const parentMetadata = await parentResolvingMetadata

  return {
    ...parentMetadata,
  }
}
