import React from 'react'
import api from '@lib/api'

// prevent static generation
export function getServerSideProps() {
  return {
    props: {},
  }
}

export default function ResolveOrder() {
  return <div>{api()}</div>
}
