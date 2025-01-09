export default function Page() {
  return <p>index</p>
}

export async function generateMetadata() {
  await new Promise((resolve) => setTimeout(resolve, 3 * 1000))
  return {
    title: 'index page',
  }
}

export const dynamic = 'force-dynamic'
