export default function Page() {
  return <div>Page</div>
}

export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 3 * 1000))
  return {
    title: 'My title',
    description: 'My description',
    applicationName: 'suspense-app',
  }
}
