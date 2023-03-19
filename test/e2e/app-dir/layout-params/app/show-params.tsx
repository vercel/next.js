import React from 'react'

export default function ShowParams({
  prefix,
  params,
}: {
  prefix: string
  params: Record<string, unknown>
}) {
  return (
    <div id={`${prefix}-layout`}>
      {Object.entries(params).map(([key, val]) => (
        <div key={key} id={`${prefix}-${key}`}>
          {JSON.stringify(val)}
        </div>
      ))}
    </div>
  )
}
