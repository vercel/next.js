'use client'

import { useState } from 'react'

export default function Client() {
  // To ensure that this component is rendered as a client component, we use a
  // state here.
  return useState('client_component')[0]
}
