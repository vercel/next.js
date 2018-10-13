import React, { Component } from "react";
import { LineItem } from "./LineItem";

interface IOwnProps {
  checkout:any;
  isCartOpen:boolean;
  handleCartClose:() => void;
  removeLineItemInCart:(id:string) => void;
  updateLineItemInCart:(lineItemId:string, quantity:number) => void;
}

class Cart extends Component<IOwnProps> {
  public openCheckout = () => {
    window.open(this.props.checkout.webUrl);
  }

  public boundHandleCartClose = () => {
    this.props.handleCartClose();
  }

  public render() {
    const lineItems = this.props.checkout.lineItems.edges.map((lineItem) => {
      return (
        <LineItem
          removeLineItemInCart={this.props.removeLineItemInCart}
          updateLineItemInCart={this.props.updateLineItemInCart}
          key={lineItem.node.id.toString()}
          line_item={lineItem.node}
        />
      );
    });
    return (
      <div className={`Cart ${this.props.isCartOpen ? "Cart--open" : ""}`}>
        <header className="Cart__header">
          <h2>Cart</h2>
          <button
            onClick={this.boundHandleCartClose}
            className="Cart__close"
          >
            ×
          </button>
        </header>
        <ul className="Cart__line-items">
          {lineItems}
        </ul>
        <footer className="Cart__footer">
          <div className="Cart-info clearfix">
            <div className="Cart-info__total Cart-info__small">Subtotal</div>
            <div className="Cart-info__pricing">
              <span className="pricing">$ {this.props.checkout.subtotalPrice}</span>
            </div>
          </div>
          <div className="Cart-info clearfix">
            <div className="Cart-info__total Cart-info__small">Taxes</div>
            <div className="Cart-info__pricing">
              <span className="pricing">$ {this.props.checkout.totalTax}</span>
            </div>
          </div>
          <div className="Cart-info clearfix">
            <div className="Cart-info__total Cart-info__small">Total</div>
            <div className="Cart-info__pricing">
              <span className="pricing">$ {this.props.checkout.totalPrice}</span>
            </div>
          </div>
          <button className="Cart__checkout button" onClick={this.openCheckout}>Checkout</button>
        </footer>
      </div>
    );
  }
}

export { Cart };
