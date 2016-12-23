import { styled } from 'styletron-react'
import Page from '../layout'

const Title = styled('div', {
  color: 'red',
  fontSize: '50px'
})

export default () => (
  <Page>
    <Title>My page</Title>
  </Page>
)
