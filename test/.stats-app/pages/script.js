import Script from 'next/script'

const Page = () => (
  <>
    <p>testing next/dynamic size</p>
    <Script dangerouslySetInnerHTML={{ __html: `console.log("hello")` }} />
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
