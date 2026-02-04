export default function Page() {
  return <p>slow static</p>
}

export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 3 * 1000))
  return {
    title: 'slow page - static',
  }
}
