'use client'

import { useState, use } from 'react';

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<any>
}

export default function Page(props: PageProps) {
  const params = use(props.params);
  const [text, setText] = useState('')
  // usage of `params`
  globalThis.f1(params)
  globalThis.f2(params)
}

