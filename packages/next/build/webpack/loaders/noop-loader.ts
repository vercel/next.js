import { loader } from 'webpack'

const NoopLoader: loader.Loader = source => source
export default NoopLoader
