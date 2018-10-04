import React, {Component} from 'react'

class LineItem extends Component {
  constructor(props) {
    super(props)
    this.decrementQuantity = this.decrementQuantity.bind(this)
    this.incrementQuantity = this.incrementQuantity.bind(this)
  }

  decrementQuantity(lineItemId) {
    this.props.updateLineItemInCart(lineItemId, this.props.line_item.quantity - 1)
  }

  incrementQuantity(lineItemId) {
    this.props.updateLineItemInCart(lineItemId, this.props.line_item.quantity + 1)
  }

  render() {
    return (
      <li className="Line-item">
        <div className="Line-item__img">
          {this.props.line_item.variant.image ? <img src={this.props.line_item.variant.image.src} alt={`${this.props.line_item.title} product shot`}/> : null}
        </div>
        <div className="Line-item__content">
          <div className="Line-item__content-row">
            <div className="Line-item__variant-title">
              {this.props.line_item.variant.title}
            </div>
            <span className="Line-item__title">
              {this.props.line_item.title}
            </span>
          </div>
          <div className="Line-item__content-row">
            <div className="Line-item__quantity-container">
              <button className="Line-item__quantity-update" onClick={() => this.decrementQuantity(this.props.line_item.id)}>-</button>
              <span className="Line-item__quantity">{this.props.line_item.quantity}</span>
              <button className="Line-item__quantity-update" onClick={() => this.incrementQuantity(this.props.line_item.id)}>+</button>
            </div>
            <span className="Line-item__price">
              $ { (this.props.line_item.quantity * this.props.line_item.variant.price).toFixed(2) }
            </span>
            <button className="Line-item__remove" onClick={()=> this.props.removeLineItemInCart(this.props.line_item.id)}>×</button>
          </div>
        </div>
      </li>
    )
  }
}

export default LineItem
