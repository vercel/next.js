import * as emotionReact from '@emotion/react'
import { PureComponent } from 'react'
import ReactDOM from 'react-dom'

const stylesInCallback = (props: any) =>
  emotionReact.css({
    color: 'red',
    background: 'yellow',
    width: `${props.scale * 100}px`,
  })

const styles = emotionReact.css({
  color: 'red',
  width: '20px',
})

const styles2 = emotionReact.css`
  color: red;
  width: 20px;
`

export class SimpleComponent extends PureComponent {
  render() {
    return (
      <div className={styles}>
        <span>hello</span>
      </div>
    )
  }
}

ReactDOM.render(<SimpleComponent />, document.querySelector('#app'))
