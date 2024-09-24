export default function Page({
  params: { productId },
}: {
  params: { productId: string }
}) {
  return <h1>{productId}</h1>
}
