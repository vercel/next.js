import Link from 'next/link'
import PropTypes from 'prop-types'
import React from 'react'
import withShopifyApiDataAndMutation from '../stores/shopifyApiDataAndMutation'

class ProductDetails extends React.Component {
  static getInitialProps ({ query: { id } }) {
    return { id }
  }

  static propTypes = {
    data: PropTypes.shape({
      loading: PropTypes.bool,
      error: PropTypes.object,
      shop: PropTypes.object,
    }).isRequired,
  }

  render () {
    if (this.props.data.loading) {
      return <p>Loading ...</p>;
    }
    if (this.props.data.error) {
      return <p>{this.props.data.error.message}</p>;
    }
    const edge = this.props.data.shop.products.edges.find((candidate) => {
      return candidate.node.id === this.props.id;
    })
    if (!edge) {
      return (
        <div>
          product not found
        </div>
      )
    }
    const product = edge.node;
    return <div>
      <h1>Your awesome product details page goes here</h1>
      <p>
        Product title is {product.title}
      </p>
      <Link href={'/'}>
        <button className='Product__buy button'>Back to catalog</button>
      </Link>
    </div>
  }
}

export default withShopifyApiDataAndMutation(ProductDetails)
