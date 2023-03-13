import { useState } from 'react'
import { useRouter } from 'next/router'

export function getStaticProps({ preview, previewData }) {
  return {
    props: {
      hasProps: true,
      random: Math.random(),
      preview: !!preview,
      previewData: previewData || null,
    },
  }
}

export default function ({ hasProps, preview, previewData, random }) {
  const router = useRouter()
  const [reloaded, setReloaded] = useState(false)

  return (
    <>
      <pre id="props-pre">
        {hasProps
          ? JSON.stringify(preview) + ' and ' + JSON.stringify(previewData)
          : 'Has No Props'}
      </pre>
      <pre id="ssg-random">{random}</pre>
      {reloaded ? <pre id="ssg-reloaded">Reloaded</pre> : null}
      <button
        id="reload-props"
        onClick={async () => {
          await router.replace(router.asPath)
          setReloaded(true)
        }}
      >
        Reload static props
      </button>
      <p id="router">{JSON.stringify({ isPreview: router.isPreview })}</p>
    </>
  )
}
