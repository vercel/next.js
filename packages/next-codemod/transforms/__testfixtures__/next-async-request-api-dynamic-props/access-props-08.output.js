export default async function Page(props) {
  const params = await props.params;
  // if there's any usage of `searchParams`
  f1(params);
  f2(params);
}
