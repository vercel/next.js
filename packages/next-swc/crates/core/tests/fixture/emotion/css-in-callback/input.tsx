import { css } from '@emotion/react'
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

const DicContainer = styled.div({
  background: 'red',
})

const SpanContainer = styled('span')({
  background: 'yellow',
})

const Container = styled('button')`
  ${stylesInCallback}
  ${() =>
    css({
      background: 'red',
    })}
`
export class SimpleComponent extends PureComponent {
  render() {
    return (
      <Container>
        <span>hello</span>
      </Container>
    )
  }
}

ReactDOM.render(<SimpleComponent />, document.querySelector('#app'))
