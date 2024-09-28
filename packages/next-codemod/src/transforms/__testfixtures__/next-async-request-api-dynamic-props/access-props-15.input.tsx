async function Page({
  params: usedParams
}: any) {
  console.log(usedParams)
}

async function generateMetadata({ params }) {
  console.log(params)
}

export default Page
export { generateMetadata }
