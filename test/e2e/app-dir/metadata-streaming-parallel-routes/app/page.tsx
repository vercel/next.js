export default function Page() {
  return <p>index page</p>
}

export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 1 * 1000))
  return {
    title: 'index page',
  }
}

export const dynamic = 'force-dynamic'
