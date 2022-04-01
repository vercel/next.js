import React, { useState, useEffect } from 'react'
import { onEntryChange } from '../sdk-plugin/index'
import RenderComponents from '../components/render-components'
import { getPageRes } from '../helper'

export default function Home({ page }) {
  const [getEntry, setEntry] = useState(page)

  useEffect(() => {
    async function fetchData() {
      try {
        const entryRes = await getPageRes('/')
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
        contentTypeUid="page"
        entryUid={getEntry.uid}
        locale={getEntry.locale}
      />
    )
  )
}

export const getStaticProps = async () => {
  try {
    const res = await getPageRes('/')
    if (!res) throw new Error('Not found')

    return {
      props: { page: res, entryUrl: '/' },
    }
  } catch (error) {
    console.error(error)
    return {
      notFound: true,
    }
  }
}
