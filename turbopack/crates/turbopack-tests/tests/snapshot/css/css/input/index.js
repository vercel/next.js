import 'foo/style.css'
import 'foo'
import './style.css'
import fooStyle from 'foo/style.module.css'
import style from './style.module.css'

console.log(style, fooStyle, import('foo'))
