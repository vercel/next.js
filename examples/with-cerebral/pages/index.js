import CerebralHoc from '../cerebral/Hoc'
import {connect} from '@cerebral/react'
import {state, signal} from 'cerebral/tags'

const Page = connect({
  userName: state`user.name`
}, props => <div>hello {props.userName}</div>)

const PageTwo = connect({
  changeName: signal`user.changeName`
}, props => <button onClick={() => props.changeName()}>click</button>)

const Ce = CerebralHoc([
  context => context.state.set('user.name', '~new Date')
])

export default p => <Ce><Page /><PageTwo /></Ce>
