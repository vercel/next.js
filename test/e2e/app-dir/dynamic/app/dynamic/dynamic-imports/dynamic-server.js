import dynamic from 'next/dynamic'

export const NextDynamicServerComponent = dynamic(
  () => import('../text-dynamic-server')
)
// export const NextDynamicNoSSRServerComponent = dynamic(
//   () => import('../text-dynamic-no-ssr-server'),
//   {
//     ssr: false,
//   }
// )
export const NextDynamicServerImportClientComponent = dynamic(
  () => import('../text-dynamic-server-import-client')
)
