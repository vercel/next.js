import * as React from 'react'
import { styles as codeFrame } from '../components/CodeFrame/styles'
import { noop as css } from '../noop-template'

export function ComponentStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: css`
          ${codeFrame}
        `,
      }}
    />
  )
}
