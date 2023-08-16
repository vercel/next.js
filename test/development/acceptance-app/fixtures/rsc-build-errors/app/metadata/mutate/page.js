export default function page(props) {
  return <p>mutate</p>
}

export async function generateMetadata(props, parent) {
  const parentMetadata = await parent

  return {
    ...parentMetadata,
  }
}
