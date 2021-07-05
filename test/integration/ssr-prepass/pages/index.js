import ssrPrepass from 'react-ssr-prepass'

const Index = () => <p>hello {ssrPrepass && 'world'}</p>

export default Index
