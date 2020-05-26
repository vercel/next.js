export const getServerSideProps = () => ({ props: { hi: 'hi' } })
export default (props) => <p>{JSON.stringify(props)}</p>
