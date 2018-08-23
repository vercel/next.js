import css from './hello-webpack-css.css'
import sass from './hello-webpack-sass.scss'
import framework from 'css-framework/framework.css'
export default () => <div className={`hello-world ${css.helloWorld} ${sass.helloWorldSass} ${framework.frameworkClass}`}>Hello World</div>
