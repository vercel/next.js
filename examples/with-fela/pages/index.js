import { createComponent } from 'react-fela'
import Page from '../layout'

const title = ({ size }) => ({
  fontSize: size + 'px',
  color: 'red'
})

const Title = createComponent(title, 'h1')

export default () => (
  <Page>
    <Title size={50}>My Title</Title>
  </Page>
)
