import css from './hello-webpack-css.css'
import framework from 'css-framework/framework.css'
export default () => <div className={`hello-world ${css.helloWorld} ${framework.frameworkClass}`}>Hello World</div>
