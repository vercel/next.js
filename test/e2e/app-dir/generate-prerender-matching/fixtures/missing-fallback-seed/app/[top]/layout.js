export default async function TopLayout({ children, params }) {
  const { top } = await params
  return <section data-top={top}>{children}</section>
}
