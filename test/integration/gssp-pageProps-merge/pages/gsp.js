export const getStaticProps = () => ({ props: { hi: 'hi' } })
const Gsp = (props) => <p>{JSON.stringify(props)}</p>
export default Gsp
