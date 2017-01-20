import React = require('react')
import MyComponent from '../components/MyComponent'

class Home extends React.Component<any, any> {
  render () {
    return <div>
      <h1>Hello world</h1>
      <MyComponent />
    </div>
  }
}

export default Home
