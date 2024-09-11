export default async function Page({ params: asyncParams }) {
  const params = await asyncParams;
  // if there's any usage of `searchParams`
  f1(params);
  f2(params);
}
