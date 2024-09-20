export default async function Page(
  props: {
    searchParams: Promise<{ [key: string]: string }>
  }
) {
  const searchParams = await props.searchParams;
  globalThis.f1(searchParams)
  globalThis.f2(searchParams)
}
