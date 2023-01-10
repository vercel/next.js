import type { ResolvedMetadata } from '../types/metadata-interface'

import React from 'react'

function Meta({
  property,
  content,
}: {
  property: string
  content: string | null | undefined
}): React.ReactElement | null {
  if (typeof content !== 'undefined' && content !== null) {
    return <meta property={property} content={content} />
  }
  return null
}

// function MultiMeta({
//   property,
//   contents,
// }: {
//   property: string
//   contents: string[] | null | undefined
// }) {
//   if (typeof contents !== 'undefined' && contents !== null) {
//     return (
//       <>
//         {contents.map((content, index) => (
//           <Meta
//             key={property + '_' + index}
//             property={property}
//             content={content}
//           />
//         ))}
//       </>
//     )
//   }
//   return null
// }

export function elementsFromResolvedOpenGraph(
  openGraph: Exclude<ResolvedMetadata['openGraph'], null>
) {
  return (
    <>
      <Meta property="og:determiner" content={openGraph.determiner} />
      <Meta property="og:title" content={openGraph.title?.absolute} />
      <Meta property="og:description" content={openGraph.description} />
      <Meta property="og:url" content={openGraph.url?.toString()} />
      <Meta property="og:site_name" content={openGraph.siteName} />
      <Meta property="og:locale" content={openGraph.locale} />
      <Meta property="og:country_name" content={openGraph.countryName} />
      <Meta property="og:ttl" content={openGraph.ttl?.toString()} />
    </>
  )
}
