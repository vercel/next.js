const A = () => {
  throw new Error('fail da export')
}
A.getInitialProps = () => {}
export default A
