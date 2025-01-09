'use client';
import { use } from "react";

import type { JSX } from 'react'

interface Props {
  params: Promise<{ slug: string }>
}

export default function Page(props: Props): JSX.Element {
  const params = use(props.params);
  const { slug } = params

  return <p>{slug}</p>
}
