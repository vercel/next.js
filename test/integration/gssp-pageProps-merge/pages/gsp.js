export const getStaticProps = () => ({ props: { hi: 'hi' } })
export default (props) => <p>{JSON.stringify(props)}</p>
