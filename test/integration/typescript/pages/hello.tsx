import { useRouter } from 'next/router'
import React from 'react'
import { hello } from '../components/hello'
import Image from '../components/image'
import Link from '../components/link'
import Router from '../components/router'
import { World } from '../components/world'
import { value as resolveOrderValue } from '../extension-order/js-first'

export enum SearchEntity {
  SEARCH_ENTITY_NONE = 0,
  SEARCH_ENTITY_POSITION = 1,
  SEARCH_ENTITY_USER = 2,
  SEARCH_ENTITY_QUESTION = 3,
  SEARCH_ENTITY_TOPIC = 4,
}

export default function HelloPage(): JSX.Element {
  const router = useRouter()
  console.log(process.browser)
  console.log(router.pathname)
  console.log(router.isReady)
  console.log(router.isPreview)
  return (
    <div>
      <p>One trillion dollars: {1_000_000_000_000}</p>
      <p id="imported-value">{resolveOrderValue}</p>
      {hello()} <World />
      <Router />
      <Link />
      <Image />
    </div>
  )
}
