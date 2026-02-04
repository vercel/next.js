async function Page(props: any) {
  console.log(props.params.foo)
}

function generateMetadata(props): Metadata {
  console.log(props.params)
}

export default Page
export { generateMetadata }
