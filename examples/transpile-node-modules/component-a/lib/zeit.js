import {color} from '../constants'
import Logo from 'component-b'

export default () => (
  <h1>
    <span>Zeit</span>
    <Logo />
    <style jsx>{`
      h1 {
        display: inline-block;
        margin: 0;
        padding: 0;
        line-height: 1;
        color: ${color};
      }
      span {
        border: 0;
        clip: rect(0 0 0 0);
        clip-path: inset(50%);
        height: 1px;
        margin: -1px;
        overflow: hidden;
        padding: 0;
        position: absolute;
        width: 1px;
        white-space: nowrap;
      }
    `}</style>
  </h1>
)
