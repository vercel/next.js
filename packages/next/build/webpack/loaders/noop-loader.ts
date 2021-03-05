import { webpack } from '../../../compiled/webpack/webpack'

const NoopLoader: webpack.loader.Loader = (source) => source
export default NoopLoader
