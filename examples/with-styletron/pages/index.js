// DOCUMENTATION: http://styletron.org

import { styled, useStyletron } from 'styletron-react'

// statically styled component
const Title = styled('h1', {
  color: 'red',
  fontSize: '82px'
})

// dynamically styled component
const SubTitle = styled('h2', ({ $size }) => ({
  color: 'blue',
  fontSize: `${$size}px`
}))

export default () => {
  // an alternative hook based API
  const [css] = useStyletron()
  return (
    <div>
      <Title>Title</Title>
      <SubTitle $size={50}>Subtitle</SubTitle>
      <p className={css({ fontSize: '32px' })}>Styled by hook</p>
    </div>
  )
}
