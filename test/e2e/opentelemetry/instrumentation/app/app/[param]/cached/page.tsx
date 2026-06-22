export function generateStaticParams() {
  return []
}

export const revalidate = 120

export default function Page() {
  return <p>Hello Cached</p>
}
