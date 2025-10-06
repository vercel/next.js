export default function Page() {
  return <p>index</p>
}

export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 1 * 1000))
  return {
    title: 'index page',
    description: 'index page description',
  }
}
