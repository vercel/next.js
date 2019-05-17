import { loader } from 'next/dist/compiled/webpack'

const NoopLoader: loader.Loader = (source) => source
export default NoopLoader
