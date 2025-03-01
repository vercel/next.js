const Page = ({ params }) => (<div>{params.slug}</div>)

const generateMetadata = ({ params }) => ({ title: params.slug })

export default Page
export { generateMetadata }
