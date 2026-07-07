import MyComp from 'comps'

const Page = () => (
  <>
    <p>Hello {typeof window}</p>
    <MyComp />
  </>
)

Page.getInitialProps = () => ({})

export default Page
