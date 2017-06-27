import React from 'react'

function withApp (Child) {
  return class WrappedComponent extends React.Component {
    static getInitialProps (context) {
      return Child.getInitialProps(context)
    }
    render () {
      return (
        <div>
          <header>
            <h1>Header</h1>
          </header>
          <main>
            <Child greeting='Hello From HOC' {...this.props} />
          </main>
          <footer>
            <h1>Footer</h1>
          </footer>
        </div>
      )
    }
  }
}

export default withApp
