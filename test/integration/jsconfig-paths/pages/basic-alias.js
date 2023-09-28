import React from 'react'
import { World } from '@c/world'

// prevent static generation
export function getServerSideProps() {
  return {
    props: {},
  }
}

export default function HelloPage() {
  return (
    <div>
      <World />
    </div>
  )
}
