import Link from 'next/link'
import React, {Component} from 'react'
import VariantSelector from './VariantSelector'

class Product extends Component {
  constructor(props) {
    super(props)
    this.state = {}
    this.handleOptionChange = this.handleOptionChange.bind(this)
    this.handleQuantityChange = this.handleQuantityChange.bind(this)
    this.findImage = this.findImage.bind(this)
  }

  componentWillMount() {
    this.props.product.options.forEach((selector) => {
      this.setState({
        selectedOptions: { [selector.name]: selector.values[0] }
      })
    })
  }

  findImage(images, variantId) {
    const primary = images[0]
    const image = images.filter(function (image) {
      return image.variant_ids.includes(variantId)
    })[0]
    return (image || primary).src
  }

  handleOptionChange(event) {
    const target = event.target
    let selectedOptions = this.state.selectedOptions
    selectedOptions[target.name] = target.value
    const selectedVariant = this.props.product.variants.edges.find((variant) => {
      return variant.node.selectedOptions.every((selectedOption) => {
        return selectedOptions[selectedOption.name] === selectedOption.value
      })
    }).node
    this.setState({
      selectedVariant: selectedVariant,
      selectedVariantImage: selectedVariant.image.src
    })
  }

  handleQuantityChange(event) {
    this.setState({
      selectedVariantQuantity: event.target.value
    })
  }

  render() {
    let variantImage = this.state.selectedVariantImage || this.props.product.images.edges[0].node.src
    let variant = this.state.selectedVariant || this.props.product.variants.edges[0].node
    let variantQuantity = this.state.selectedVariantQuantity || 1
    let variant_selectors = this.props.product.options.map((option) => {
      return (
        <VariantSelector
          handleOptionChange={this.handleOptionChange}
          key={option.id.toString()}
          option={option}
        />
      )
    })
    return (
      <div className='Product'>
        {this.props.product.images.edges.length ? <img src={variantImage} alt={`${this.props.product.title} product shot`}/> : null}
        <Link href={'/product?id='+this.props.product.id} as={'/product/'+this.props.product.id}>
          <a>
            <h5 className='Product__title'>{this.props.product.title}</h5>
          </a>
        </Link>
        <span className='Product__price'>${variant.price}</span>
        {variant_selectors}
        <label className='Product__option'>
          Quantity
          <input min='1' type='number' defaultValue={variantQuantity} onChange={this.handleQuantityChange}></input>
        </label>
        <Link href={'/product?id='+this.props.product.id} as={'/product/'+this.props.product.id}>
          <button className='Product__buy button'>Details</button>
        </Link>
        <button className='Product__buy button' onClick={() => this.props.addVariantToCart(variant.id, variantQuantity)}>Add to Cart</button>
      </div>
    )
  }
}

export default Product
