import React, { Component, PropTypes } from 'react'
import { connect } from 'react-redux'
import { graphql } from 'react-apollo'
import gql from 'graphql-tag'
import { bindActionCreators } from 'redux'
import Layout from '../components/layout'
import * as demoActions from '../actions/demoActions'
/**
 * Home component to show basic redux usage with nextjs.
 */
class Home extends Component {
  static propTypes = {
    /**
     * demo string from redux actions.
     */
    demoString: PropTypes.string.isRequired,
    /**
     * redux function from actions to set the string, accepts a string param,
     * if none is passed, it will return the default string set in the action.
     */
    setString: PropTypes.func.isRequired
  };
  constructor () {
    super()
    this.changeDemoString = this.changeDemoString.bind(this)
  }
  componentDidMount () {
    const { setString } = this.props
    setString()
  }
  /**
   * Change the demo string to whatever you pass as a parameter.
   * @param {string} theString - String to be passed to show in component.
   */
  changeDemoString (theString: String) {
    const { setString } = this.props
    setString(theString)
  }

  render () {
    const { demoString } = this.props
    const { foodtrucks, loading } = this.props.data
    return (
      <Layout title='Home page'>
        <button
          onClick={() => this.changeDemoString('not the default string')}
        >
          change demo string of redux store property to 'not the default string'
        </button>
        <button
          onClick={() => this.changeDemoString()}
        >
          change back to default
        </button>
        {
          loading ? <p> Loading ...</p>
          : <p> Found { foodtrucks.length} foodtrucks!</p>
        }
        <p>{demoString}</p>
      </Layout>
    )
  }
}

function mapStateToProps (state) {
  return {
    demoString: state.demoString
  }
}

function mapDispatchToProps (dispatch) {
  return bindActionCreators(demoActions, dispatch)
}

const MyQuery = gql`query foodTrucks {
  foodtrucks {
    _id
    name
  }
 }`
const HomeWithGraphQl = graphql(MyQuery)(Home)
export default connect(mapStateToProps, mapDispatchToProps)(HomeWithGraphQl)
