import React, { Component } from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { loadExampleData, loadingExampleDataFailure } from '../store'

class DataList extends Component {
  state = {
    isDataLoading: false
  }

  componentDidMount () {
    const { loadExampleData, loadingExampleDataFailure } = this.props
    const self = this

    this.setState({ isDataLoading: true })
    window
      .fetch('https://jsonplaceholder.typicode.com/users')
      .then(function (response) {
        if (response.status !== 200) {
          console.log(
            'Looks like there was a problem. Status Code: ' + response.status
          )
          loadingExampleDataFailure()
          self.setState({ isDataLoading: false })
          return
        }
        response.json().then(function (data) {
          loadExampleData(data)
          self.setState({ isDataLoading: false })
        })
      })
      .catch(function (err) {
        console.log('Fetch Error :-S', err)
        loadingExampleDataFailure()
        self.setState({ isDataLoading: false })
      })
  }

  render () {
    const { exampleData, error } = this.props
    const { isDataLoading } = this.state

    return (
      <div>
        <h1>API DATA:</h1>
        {exampleData && !isDataLoading ? (
          <pre>
            <code>{JSON.stringify(exampleData, null, 2)}</code>
          </pre>
        ) : (
          <p style={{ color: 'blue' }}>Loading...</p>
        )}
        {error && <p style={{ color: 'red' }}>Error fetching data.</p>}
      </div>
    )
  }
}

function mapStateToProps (state) {
  const { exampleData, error } = state
  return { exampleData, error }
}
const mapDispatchToProps = dispatch =>
  bindActionCreators({ loadExampleData, loadingExampleDataFailure }, dispatch)

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(DataList)
