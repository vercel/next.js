import type { webpack } from 'next/dist/compiled/webpack/webpack'

const EmptyLoader: webpack.LoaderDefinitionFunction = () => 'export default {}'
export default EmptyLoader
