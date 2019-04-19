import { useFela, FelaComponent } from 'react-fela'

import FelaProvider from '../FelaProvider'

const Container = ({ children }) => (
  <FelaComponent
    style={{
      maxWidth: 700,
      marginLeft: 'auto',
      marginRight: 'auto',
      lineHeight: 1.5
    }}
    as='div'
  >
    {children}
  </FelaComponent>
)

const textRule = ({ size, theme }) => ({
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontSize: size,
  color: '#333'
})

function Text ({ size = 16, children }) {
  const { css } = useFela({ size })

  return <p className={css(textRule)}>{children}</p>
}

function Title ({ children, size = 24 }) {
  const { css } = useFela()

  return <h1 className={css({ fontSize: size, color: '#555' })}>{children}</h1>
}

export default () => (
  <FelaProvider>
    <Container>
      <Title size={50}>My Title</Title>
      <Text>Hi, I am Fela.</Text>
    </Container>
  </FelaProvider>
)
