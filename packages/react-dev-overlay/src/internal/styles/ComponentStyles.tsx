import * as React from 'react'
import { styles as codeFrame } from '../components/CodeFrame/styles'
import { styles as overlay } from '../components/Overlay/styles'
import { noop as css } from '../noop-template'

export function ComponentStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: css`
          ${codeFrame}
          ${overlay}
        `,
      }}
    />
  )
}
