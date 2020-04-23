import * as React from 'react'
import { noop as css } from '../noop-template'

export function Theme() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: css`
          :host {
            all: initial;
          }
        `,
      }}
    />
  )
}
