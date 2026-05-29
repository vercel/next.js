import dynamic from 'next/dynamic'

const Page = dynamic(() => import('../../components/esm.mjs'), { ssr: false })

export default Page
