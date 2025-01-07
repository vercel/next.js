'use client'

import { Suspense } from 'react'
import styled from 'styled-components'
import { createDataFetcher } from '../../../lib/data'

const Footer = styled.div`
  border: 1px solid orange;
  color: blue;
`

const FootInner = styled.span`
  padding: 2px;
  color: orange;
`

const readData = createDataFetcher('streaming', {
  timeout: 4000,
  expire: 4000,
})

function SuspenseyFooter() {
  readData()
  // generate large chunk of text to let the suspensey styling be inserted before the suspense script
  return (
    <FootInner id="footer-inner">
      {'(generate-large-footer-text)'.repeat(30)}
    </FootInner>
  )
}

export default function page() {
  return (
    <div>
      <Footer id="footer">
        {`wait for `}
        <Suspense fallback={`$test-fallback-sentinel`}>
          <SuspenseyFooter />
        </Suspense>
      </Footer>
    </div>
  )
}

export const dynamic = 'force-dynamic'
