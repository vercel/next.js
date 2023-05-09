import { webpack } from 'next/dist/compiled/webpack/webpack'

const NoopLoader: webpack.LoaderDefinitionFunction = (source) => source
export default NoopLoader
