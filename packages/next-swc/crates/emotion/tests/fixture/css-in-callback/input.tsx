import { css, Global } from '@emotion/react'
import styled from '@emotion/styled'
import { PureComponent } from 'react'
import ReactDOM from 'react-dom'

const stylesInCallback = (props: any) =>
  css({
    color: 'red',
    background: 'yellow',
    width: `${props.scale * 100}px`,
  })

const styles = css({
  color: 'red',
  width: '20px',
})

const styles2 = css`
  color: red;
  width: 20px;
`

const DivContainer = styled.div({
  background: 'red',
})

const DivContainer2 = styled.div`
  background: red;
`

const ContainerWithOptions = styled('div', {
  shouldForwardProp: (propertyName: string) => !propertyName.startsWith('$'),
})`
  color: hotpink;
`

const SpanContainer = styled('span')({
  background: 'yellow',
})

export const DivContainerExtended = styled(DivContainer)``
export const DivContainerExtended2 = styled(DivContainer)({})

const Container = styled('button')`
  background: red;
  ${stylesInCallback}
  ${() =>
    css({
      background: 'red',
    })}
  color: yellow;
  font-size: 12px;
`

const Container2 = styled.div`
  background: red;
`

export class SimpleComponent extends PureComponent {
  render() {
    return (
      <Container
        css={css`
          color: hotpink;
        `}
      >
        <Global
          styles={css`
            html,
            body {
              padding: 3rem 1rem;
              margin: 0;
              background: papayawhip;
              min-height: 100%;
              font-family: Helvetica, Arial, sans-serif;
              font-size: 24px;
            }
          `}
        />
        <span>hello</span>
      </Container>
    )
  }
}

ReactDOM.render(<SimpleComponent />, document.querySelector('#app'))
