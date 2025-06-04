export default function Page() {
  return <div>static page</div>
}

export async function generateMetadata() {
  return {
    title: 'static page',
    description: 'static page description',
  }
}
