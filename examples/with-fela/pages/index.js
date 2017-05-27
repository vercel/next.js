import { createComponent } from 'react-fela'
import Page from '../layout'

const title = ({ size }) => ({
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontSize: size + 'px',
  color: 'red'
})

const Title = createComponent(title, 'h1')

export default () => (
  <Page>
    <Title size={50}>My Title</Title>
  </Page>
)
