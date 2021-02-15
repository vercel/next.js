import { css, cx, keyframes, injectGlobal } from '@emotion/css'

injectGlobal`
  * {
    box-sizing: border-box;
  }
  body {
    background: #DFCFBE;
    font-family: Helvetica, sans-serif;
  }
`

const basicStyles = css`
  background-color: white;
  color: cornflowerblue;
  border: 1px solid lightgreen;
  border-right: none;
  border-bottom: none;
  box-shadow: 5px 5px 0 0 lightgreen, 10px 10px 0 0 lightyellow;
  transition: all 0.1s linear;
  margin: 3rem 0;
  padding: 1rem 0.5rem;
`

const otherStyles = css`
  background-color: red;
  padding: 10px;
  margin-bottom: 10px;
`

const someMoreBasicStyles = css`
  background-color: green;
  color: white;
  margin-bottom: 10px;
  padding: 10px;
`

const someCssAsObject = css({
  background: 'orange',
  color: 'white',
  padding: '10px',
  marginBottom: '10px',
})

const combinedAsArray = css([someMoreBasicStyles, someCssAsObject])

const cls1 = css`
  font-size: 20px;
  padding: 5px;
  background: green;
  color: orange;
`
const cls2 = css`
  font-size: 20px;
  padding: 15px;
  background: blue;
  color: white;
`

const cxExample = cx(cls1, cls2)

const bounce = keyframes`
  from, 20%, 53%, 80%, to {
    transform: translate3d(0,0,0);
  }

  40%, 43% {
    transform: translate3d(0, -30px, 0);
  }

  70% {
    transform: translate3d(0, -15px, 0);
  }

  90% {
    transform: translate3d(0,-4px,0);
  }
`

const keyframesExample = css([
  bounce,
  css({
    marginTop: '50px',
    width: '20px',
    height: '20px',
    background: 'black',
    borderRadius: '50%',
    padding: '20px',
    animation: `${bounce} 1s ease infinite`,
    transformOrigin: 'center',
  }),
])

export {
  combinedAsArray,
  cxExample,
  keyframesExample,
  someCssAsObject,
  someMoreBasicStyles,
  otherStyles,
  basicStyles,
}
