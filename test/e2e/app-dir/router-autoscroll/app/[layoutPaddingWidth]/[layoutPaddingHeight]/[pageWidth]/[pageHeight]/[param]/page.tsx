export default function Page({
  params: { pageHeight, pageWidth },
}: {
  params: { pageWidth: string; pageHeight: string }
}) {
  return (
    <div
      id="page"
      style={{
        height: Number(pageHeight),
        width: Number(pageWidth),
        background: 'green',
      }}
    />
  )
}
