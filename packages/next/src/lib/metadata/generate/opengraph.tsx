import type { ResolvedMetadata } from '../types/metadata-interface'

import React from 'react'
import { Meta, MultiMeta } from './meta'

export function ResolvedOpenGraphMetadata({
  openGraph,
}: {
  openGraph: ResolvedMetadata['openGraph']
}) {
  if (!openGraph) {
    return null
  }

  let typedOpenGraph
  if ('type' in openGraph) {
    switch (openGraph.type) {
      case 'website':
        typedOpenGraph = <Meta property="og:type" content="website" />
        break
      case 'article':
        typedOpenGraph = (
          <>
            <Meta property="og:type" content="article" />
            <Meta
              property="article:published_time"
              content={openGraph.publishedTime?.toString()}
            />
            <Meta
              property="article:modified_time"
              content={openGraph.modifiedTime?.toString()}
            />
            <Meta
              property="article:expiration_time"
              content={openGraph.expirationTime?.toString()}
            />
            <MultiMeta
              propertyPrefix="article:author"
              contents={openGraph.authors}
            />
            <Meta property="article:section" content={openGraph.section} />
            <MultiMeta propertyPrefix="article:tag" contents={openGraph.tags} />
          </>
        )
        break
      case 'book':
        typedOpenGraph = (
          <>
            <Meta property="og:type" content="book" />
            <Meta property="book:isbn" content={openGraph.isbn} />
            <Meta
              property="book:release_date"
              content={openGraph.releaseDate}
            />
            <MultiMeta
              propertyPrefix="book:author"
              contents={openGraph.authors}
            />
            <MultiMeta propertyPrefix="book:tag" contents={openGraph.tags} />
          </>
        )
        break
      case 'profile':
        typedOpenGraph = (
          <>
            <Meta property="og:type" content="profile" />
            <Meta property="profile:first_name" content={openGraph.firstName} />
            <Meta property="profile:last_name" content={openGraph.lastName} />
            <Meta property="profile:username" content={openGraph.username} />
            <Meta property="profile:gender" content={openGraph.gender} />
          </>
        )
        break
      case 'music.song':
        typedOpenGraph = (
          <>
            <Meta property="og:type" content="music.song" />
            <Meta
              property="music:duration"
              content={openGraph.duration?.toString()}
            />
            <MultiMeta
              propertyPrefix="music:album"
              contents={openGraph.albums}
            />
            <MultiMeta
              propertyPrefix="music:musician"
              contents={openGraph.musicians}
            />
          </>
        )
        break
      case 'music.album':
        typedOpenGraph = (
          <>
            <Meta property="og:type" content="music.album" />
            <MultiMeta propertyPrefix="music:song" contents={openGraph.songs} />
            <MultiMeta
              propertyPrefix="music:musician"
              contents={openGraph.musicians}
            />
            <Meta
              property="music:release_date"
              content={openGraph.releaseDate}
            />
          </>
        )
        break
      case 'music.playlist':
        typedOpenGraph = (
          <>
            <Meta property="og:type" content="music.playlist" />
            <MultiMeta propertyPrefix="music:song" contents={openGraph.songs} />
            <MultiMeta
              propertyPrefix="music:creator"
              contents={openGraph.creators}
            />
          </>
        )
        break
      case 'music.radio_station':
        typedOpenGraph = (
          <>
            <Meta property="og:type" content="music.radio_station" />
            <MultiMeta
              propertyPrefix="music:creator"
              contents={openGraph.creators}
            />
          </>
        )
        break
      case 'video.movie':
        typedOpenGraph = (
          <>
            <Meta property="og:type" content="video.movie" />
            <MultiMeta
              propertyPrefix="video:actor"
              contents={openGraph.actors}
            />
            <MultiMeta
              propertyPrefix="video:director"
              contents={openGraph.directors}
            />
            <MultiMeta
              propertyPrefix="video:writer"
              contents={openGraph.writers}
            />
            <Meta property="video:duration" content={openGraph.duration} />
            <Meta
              property="video:release_date"
              content={openGraph.releaseDate}
            />
            <MultiMeta propertyPrefix="video:tag" contents={openGraph.tags} />
          </>
        )
        break
      case 'video.episode':
        typedOpenGraph = (
          <>
            <Meta property="og:type" content="video.episode" />
            <MultiMeta
              propertyPrefix="video:actor"
              contents={openGraph.actors}
            />
            <MultiMeta
              propertyPrefix="video:director"
              contents={openGraph.directors}
            />
            <MultiMeta
              propertyPrefix="video:writer"
              contents={openGraph.writers}
            />
            <Meta property="video:duration" content={openGraph.duration} />
            <Meta
              property="video:release_date"
              content={openGraph.releaseDate}
            />
            <MultiMeta propertyPrefix="video:tag" contents={openGraph.tags} />
            <Meta property="video:series" content={openGraph.series} />
          </>
        )
        break
      case 'video.tv_show':
        typedOpenGraph = <Meta property="og:type" content="video.tv_show" />
        break
      case 'video.other':
        typedOpenGraph = <Meta property="og:type" content="video.other" />
        break
      default:
        throw new Error('Invalid OpenGraph type: ' + (openGraph as any).type)
    }
  }

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
      <MultiMeta propertyPrefix="og:image" contents={openGraph.images} />
      <MultiMeta propertyPrefix="og:video" contents={openGraph.videos} />
      <MultiMeta propertyPrefix="og:audio" contents={openGraph.audio} />
      <MultiMeta propertyPrefix="og:email" contents={openGraph.emails} />
      <MultiMeta
        propertyPrefix="og:phone_number"
        contents={openGraph.phoneNumbers}
      />
      <MultiMeta
        propertyPrefix="og:fax_number"
        contents={openGraph.faxNumbers}
      />
      <MultiMeta
        propertyPrefix="og:locale:alternate"
        contents={openGraph.alternateLocale}
      />
      {typedOpenGraph}
    </>
  )
}
