import React, { useState, useEffect } from 'react'
import { onEntryChange } from '../sdk-plugin/index'
import RenderComponents from '../components/render-components'
import { getPageRes } from '../helper/index'

export default function About({ page }) {
  const [getEntry, setEntry] = useState(page)

  useEffect(() => {
    async function fetchData() {
      try {
        const entryRes = await getPageRes('/about-us')
        setEntry(entryRes)
      } catch (error) {
        console.error(error)
      }
    }
    onEntryChange(() => fetchData())
  }, [])

  return (
    getEntry && (
      <RenderComponents
        pageComponents={getEntry.page_components}
        about
        contentTypeUid="page"
        entryUid={getEntry.uid}
        locale={getEntry.locale}
      />
    )
  )
}

export const getStaticProps = async () => {
  try {
    const res = await getPageRes('/about-us')
    if (!res) throw new Error('Not found')

    return {
      props: { page: res, entryUrl: '/about-us' },
    }
  } catch (error) {
    console.error(error)
    return {
      notFound: true,
    }
  }
}
