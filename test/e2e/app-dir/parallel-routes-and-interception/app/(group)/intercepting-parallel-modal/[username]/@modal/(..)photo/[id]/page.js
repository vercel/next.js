export function generateStaticParams() {
  return [
    { username: 'vercel', id: '0' },
    { username: 'vercel', id: '1' },
  ]
}

export default async function Page({ params }) {
  const { id } = await params
  return <p id={`photo-modal-${id}`}>Photo MODAL {id}</p>
}
