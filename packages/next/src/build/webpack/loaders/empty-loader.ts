import type { webpack } from 'webpack/webpack'

const EmptyLoader: webpack.LoaderDefinitionFunction = () => 'export default {}'
export default EmptyLoader
