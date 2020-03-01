import ssrPrepass from 'react-ssr-prepass'

export default () => <p>hello {ssrPrepass && 'world'}</p>
