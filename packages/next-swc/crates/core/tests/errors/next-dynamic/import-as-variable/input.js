import dynamic from 'next/dynamic'

const module = () => import('../components/hello')
const DynamicComponentWithCustomLoading = dynamic(module)
