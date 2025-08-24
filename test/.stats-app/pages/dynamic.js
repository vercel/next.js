import dynamic from 'next/dynamic'

const DynamicHello = dynamic(() =>
  import('../components/hello').then((mod) => mod.Hello)
)

const Page = () => (
  <>
    <p>testing next/dynamic size</p>
    <DynamicHello />
  </>
)

// we add getServerSideProps to prevent static optimization
// to allow us to compare server-side changes
export const getServerSideProps = () => {
  return {
    props: {},
  }
}

export default Page
