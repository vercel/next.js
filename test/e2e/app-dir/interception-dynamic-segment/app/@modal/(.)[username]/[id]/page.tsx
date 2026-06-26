export default function Page() {
  return 'intercepted'
}

export async function generateStaticParams() {
  return [{ username: 'john', id: '1' }]
}
