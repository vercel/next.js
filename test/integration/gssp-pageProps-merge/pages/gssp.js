export const getServerSideProps = () => ({ props: { hi: 'hi' } })
const Gssp = (props) => <p>{JSON.stringify(props)}</p>
export default Gssp
