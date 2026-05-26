import type { webpack } from 'next/dist/webpack/compiled/webpack/webpack'

const EmptyLoader: webpack.LoaderDefinitionFunction = () => 'export default {}'
export default EmptyLoader
