export default async function Page({ params }: { params: { slug: string } }) {
  // usage of `params`
  globalThis.f1(params)
  globalThis.f2(params)
}
