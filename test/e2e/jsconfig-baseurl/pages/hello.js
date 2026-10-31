import React from 'react'
import { World } from 'components/world'

// prevent static generation for trace test
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
