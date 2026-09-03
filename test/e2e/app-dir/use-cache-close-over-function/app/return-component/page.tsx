async function getCachedComponent() {
  'use cache'

  function PostContent() {
    return <p>hello from cached component</p>
  }

  // Intentionally return the component function — this is not serializable.
  return PostContent
}

export default async function Page() {
  const Content = await getCachedComponent()
  return <Content />
}
