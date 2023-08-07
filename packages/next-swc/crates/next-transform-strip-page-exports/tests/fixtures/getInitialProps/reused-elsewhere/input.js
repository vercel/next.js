export default function Page() {
  return <div />
}

const getInitialProps = (Page.getInitialProps = function getInitialProps() {
  return {
    prop: true,
  }
})
