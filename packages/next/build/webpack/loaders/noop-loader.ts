import { webpack } from 'next/dist/compiled/webpack/webpack'

const NoopLoader: webpack.loader.Loader = (source) => source
export default NoopLoader
