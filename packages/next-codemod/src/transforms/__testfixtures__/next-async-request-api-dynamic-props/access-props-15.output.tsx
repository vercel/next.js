async function Page(props: any) {
  const usedParams = await props.params;
  console.log(usedParams)
}

async function generateMetadata(props) {
  const params = await props.params;
  console.log(params)
}

export default Page
export { generateMetadata }
