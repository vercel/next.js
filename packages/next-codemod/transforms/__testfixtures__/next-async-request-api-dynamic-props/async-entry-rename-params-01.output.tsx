export default async function Page({ params: asyncParams } : { params: Promise<{ slug: string }> }) {
  const params = await asyncParams;
  // usage of `params`
  globalThis.f1(params);
  globalThis.f2(params);
}
