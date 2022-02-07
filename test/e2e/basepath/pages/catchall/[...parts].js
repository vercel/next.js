import { useRouter } from 'next/router'

const Page = () => <p>parts: {useRouter().query.parts?.join('/')}</p>
export default Page
