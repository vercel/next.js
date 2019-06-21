import { loader } from 'next/dist/compiled/webpack.js'

const NoopLoader: loader.Loader = source => source
export default NoopLoader
