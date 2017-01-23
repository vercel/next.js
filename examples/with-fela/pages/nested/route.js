import { createComponent } from 'react-fela'
import Page from '../../layout'

import Link from 'next/link'

const title = () => ({
  color: 'yellow',
  fontSize: '120px',
  background: 'green',
})

const Title = createComponent(title)

export default () => (
  <Page>
    <Title>My Nested Subroute</Title>
    <Link href="/"><a>back home</a></Link>
    <Link href="/route"><a>route</a></Link>
  </Page>
)
