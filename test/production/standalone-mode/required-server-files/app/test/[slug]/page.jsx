export const revalidate = 3600

export default function Page() {
  return <div>Hello, World!</div>
}

export async function generateStaticParams() {
  return []
}
