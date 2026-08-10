if (typeof window !== 'undefined') {
  throw new Error('top level error')
}

const Page = () => 'page'

export default Page
