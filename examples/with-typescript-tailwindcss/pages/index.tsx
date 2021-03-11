import Link from 'next/link'
import Layout from '../components/Layout'

const IndexPage = () => (
  <Layout title="Home">
    <div class="container w-full md:max-w-3xl mx-auto pt-20 mb-8">
      <div class="w-full px-4 md:px-6 text-xl text-gray-800 justify-center items-center flex">
        <h1 class="font-bold text-gray-900 pt-6 pb-2 text-2xl md:text-4xl">Next.js + Typescript + Tailwind CSS</h1>
      </div>
    </div>
  </Layout>
)

export default IndexPage
