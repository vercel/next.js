export default async function Page() {
  return <p>suspenseful - static</p>
}

export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 1 * 1000))
  return {
    title: 'suspenseful page - static',
  }
}
