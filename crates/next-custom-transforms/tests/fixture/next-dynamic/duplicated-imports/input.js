import dynamic1 from 'next/dynamic'
import dynamic2 from 'next/dynamic'

const DynamicComponent1 = dynamic1(() => import('../components/hello1'))
const DynamicComponent2 = dynamic2(() => import('../components/hello2'))
