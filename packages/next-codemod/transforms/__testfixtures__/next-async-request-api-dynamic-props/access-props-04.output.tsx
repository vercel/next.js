'use client'

import { useState, use } from 'react';

export default function Page(props: { params: Promise<{ slug: string }> }) {
  const params = use(props.params);
  const [text, setText] = useState('')
  // usage of `params`
  globalThis.f1(params)
  globalThis.f2(params)
}
