export default async function Page(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  // usage of `params`
  globalThis.f1(params)
  globalThis.f2(params)
}
