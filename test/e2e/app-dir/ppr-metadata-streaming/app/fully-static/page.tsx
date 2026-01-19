export default function Page() {
  return <p>slow</p>
}

export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 2 * 1000))
  return {
    title: 'fully static',
    description: 'fully static',
  }
}
