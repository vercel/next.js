import React, { use } from 'react';

export default function Page(props: { params: Promise<{ slug: string }> }) {
  const params = use(props.params);
  React.use()
  return <p>child {params.slug}</p>
}
