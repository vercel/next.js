'use client'

import React from 'react'

export default function Page() {
  const err = new Error('Something went wrong', {
    cause: 'a plain string cause',
  })
  console.error(err)

  return <p>Check Redbox</p>
}
