import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(
  () => import('./component').then(mod => {
    return mod.default;
  })
)
