import dynamic from 'next/dynamic'

const DynamicImportSourceNextDynamic1 = dynamic(() => import(source).then(mod => mod))
const DynamicImportSourceNextDynamic2 = dynamic(async () => {
  const mod = await import(source)
  return mod.Component
})
