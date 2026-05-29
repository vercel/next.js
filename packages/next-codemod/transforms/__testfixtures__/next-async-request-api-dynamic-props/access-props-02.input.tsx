export default async function Page({
  searchParams,
}: {
  searchParams: { [key: string]: string }
}) {
  globalThis.f1(searchParams)
  globalThis.f2(searchParams)
}
