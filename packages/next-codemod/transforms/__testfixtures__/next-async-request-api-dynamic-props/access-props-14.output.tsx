export default async function Page(props: any) {
  const usedParams = await props.params;
  console.log(usedParams)
}
