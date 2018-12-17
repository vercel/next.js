import React from 'react'
import PropTypes from 'prop-types'
import {
  RefinementList,
  SearchBox,
  Hits,
  Configure,
  Highlight,
  Pagination
} from 'react-instantsearch/dom'
import { InstantSearch } from './instantsearch'

const HitComponent = ({ hit }) => (
  <div className='hit'>
    <div>
      <div className='hit-picture'>
        <img src={`${hit.image}`} />
      </div>
    </div>
    <div className='hit-content'>
      <div>
        <Highlight attributeName='name' hit={hit} />
        <span> - ${hit.price}</span>
        <span> - {hit.rating} stars</span>
      </div>
      <div className='hit-type'>
        <Highlight attributeName='type' hit={hit} />
      </div>
      <div className='hit-description'>
        <Highlight attributeName='description' hit={hit} />
      </div>
    </div>
  </div>
)

HitComponent.propTypes = {
  hit: PropTypes.object
}

export default class extends React.Component {
  static propTypes = {
    searchState: PropTypes.object,
    resultsState: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
    onSearchStateChange: PropTypes.func
  }

  render () {
    return (
      <InstantSearch
        appId='appId' // change this
        apiKey='apiKey' // change this
        indexName='indexName' // change this
        resultsState={this.props.resultsState}
        onSearchStateChange={this.props.onSearchStateChange}
        searchState={this.props.searchState}
      >
        <Configure hitsPerPage={10} />
        <header>
          <h1>React InstantSearch + Next.Js</h1>
          <SearchBox />
        </header>
        <content>
          <menu>
            <RefinementList attributeName='category' />
          </menu>
          <results>
            <Hits hitComponent={HitComponent} />
          </results>
        </content>
        <footer>
          <Pagination />
          <div>
            See{' '}
            <a href='https://github.com/algolia/react-instantsearch/tree/master/packages/react-instantsearch/examples/next-app'>
              source code
            </a>{' '}
            on github
          </div>
        </footer>
      </InstantSearch>
    )
  }
}
