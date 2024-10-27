import dynamic from 'my-dynamic-call'

const DynamicComponent = dynamic(
  () => import('./component').then(mod => {
    return mod.Component;
  })
)
