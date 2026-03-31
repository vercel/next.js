import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('../../components/nested1'))

export default DynamicComponent
