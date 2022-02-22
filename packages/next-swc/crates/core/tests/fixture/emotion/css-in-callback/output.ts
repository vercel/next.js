import { jsx as _jsx } from 'react/jsx-runtime'
import { css } from '@emotion/react'
import styled from '@emotion/styled'
import { PureComponent } from 'react'
import ReactDOM from 'react-dom'
const stylesInCallback = (props: any) =>
  css(
    {
      color: 'red',
      background: 'yellow',
      width: `${props.scale * 100}px`,
    },
    'label:stylesInCallback'
  )
const styles = css(
  {
    color: 'red',
    width: '20px',
  },
  'label:styles'
)
const DicContainer = styled('div', {
  target: 'ep3ww290',
  label: 'label:DicContainer',
})({
  background: 'red',
})
const SpanContainer = styled('span', {
  target: 'ep3ww291',
  label: 'label:SpanContainer',
})({
  background: 'yellow',
})
const Container = styled('button')`
  ${stylesInCallback}
  ${() =>
    css(
      {
        background: 'red',
      },
      'label:Container'
    )}
`
export class SimpleComponent extends PureComponent {
  render() {
    return _jsx(Container, {
      children: _jsx('span', {
        children: 'hello',
      }),
    })
  }
}
ReactDOM.render(_jsx(SimpleComponent, {}), document.querySelector('#app'))
