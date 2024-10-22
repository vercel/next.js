async function Page(props: any) {
  console.log((await props.params).foo)
}

async function generateMetadata(props): Promise<Metadata> {
  console.log((await props.params))
}

export default Page
export { generateMetadata }
