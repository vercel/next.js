export default function Product({ params }: { params: { id: string } }) {
  return <div>Product: {params.id}</div>
}
