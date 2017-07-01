import { createComponent } from 'react-fela'
import Page from '../layout'

const Container = createComponent(() => ({
  maxWidth: 700,
  marginLeft: 'auto',
  marginRight: 'auto',
  lineHeight: 1.5
}))

const Text = createComponent(({ size = 16 }) => ({
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontSize: size,
  color: '#333'
}))

const Title = createComponent(
  ({ size = 24 }) => ({
    fontSize: size,
    color: '#555'
  }),
  Text,
)

export default () =>
  <Page>
    <Container>
      <Title size={50}>My Title</Title>
      <Text>Hi, I am Fela.</Text>
    </Container>
  </Page>
