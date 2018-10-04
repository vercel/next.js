import PropTypes from 'prop-types'
import React, { Component } from 'react'
import Cart from '../components/Cart'
import CustomerAuthWithMutation from '../components/CustomerAuth'
import Product from '../components/Product'
import {
  addVariantToCart,
  updateLineItemInCart,
  removeLineItemInCart,
  associateCustomerCheckout
} from '../stores/shopifyCheckoutApi'
import withShopifyApiDataAndMutation from '../stores/shopifyApiDataAndMutation'

class App extends Component {
  constructor() {
    super();

    this.state = {
      isCartOpen: false,
      isCustomerAuthOpen: false,
      isNewCustomer: false,
      products: [],
      checkout: { lineItems: { edges: [] } }
    };

    this.handleCartClose = this.handleCartClose.bind(this)
    this.handleCartOpen = this.handleCartOpen.bind(this)
    this.openCustomerAuth = this.openCustomerAuth.bind(this)
    this.closeCustomerAuth = this.closeCustomerAuth.bind(this)
    this.addVariantToCart = addVariantToCart.bind(this)
    this.updateLineItemInCart = updateLineItemInCart.bind(this)
    this.removeLineItemInCart = removeLineItemInCart.bind(this)
    this.showAccountVerificationMessage = this.showAccountVerificationMessage.bind(this)
    this.associateCustomerCheckout = associateCustomerCheckout.bind(this)
  }

  componentWillMount() {
    this.props.createCheckout({
      variables: {
        input: {}
      }}).then((res) => {
      this.setState({
        checkout: res.data.checkoutCreate.checkout
      })
    })
  }

  static propTypes = {
    data: PropTypes.shape({
      loading: PropTypes.bool,
      error: PropTypes.object,
      shop: PropTypes.object,
    }).isRequired,
    createCheckout: PropTypes.func.isRequired,
    checkoutLineItemsAdd: PropTypes.func.isRequired,
    checkoutLineItemsUpdate: PropTypes.func.isRequired
  }

  handleCartOpen() {
    this.setState({
      isCartOpen: true,
    });
  }

  handleCartClose() {
    this.setState({
      isCartOpen: false,
    });
  }

  openCustomerAuth(event) {
    if (event.target.getAttribute('data-customer-type') === "new-customer") {
      this.setState({
        isNewCustomer: true,
        isCustomerAuthOpen: true
      });
    } else {
      this.setState({
        isNewCustomer: false,
        isCustomerAuthOpen: true
      });
    }
  }

  showAccountVerificationMessage(){
    this.setState({ accountVerificationMessage: true });
    setTimeout(() => {
     this.setState({
       accountVerificationMessage: false
     })
   }, 5000);
  }

  closeCustomerAuth() {
    this.setState({
      isCustomerAuthOpen: false,
    });
  }

  render() {
    if (this.props.data.loading) {
      return <p>Loading ...</p>;
    }
    if (this.props.data.error) {
      return <p>{this.props.data.error.message}</p>;
    }

    return (
      <div>
        <style>{`
/* INITIALIZERS + DEFAULTS
* ============================== */
/* @import url('https://fonts.googleapis.com/css?family=Roboto:300,400,700'); */

*, *:before, *:after {
 box-sizing: border-box;
}

html {
 font-size: 65%;
}

body {
 margin: 0;
 padding: 0;
 font-family: 'Roboto', sans-serif;
 font-weight: 400;
}

img {
 display: block;
 max-width: 100%;
 max-height: 100%;
}

h1 {
 font-weight: 300;
 margin: 0 0 15px;
 font-size: 3rem;
}

h2 {
 font-weight: 300;
 margin: 0;
 font-size: 2rem;
}

/* BASE APP
* ============================== */
.App__header {
 background-color: #222;
 background-image: url('https://unsplash.it/1000/300?image=823');
 background-size: cover;
 color: white;
 padding: 10px 10px;
}

.App__nav{
 width: 100%;
 list-style: none;
}

.App__customer-actions {
 float: left;
 padding: 10px;
}

.App__title {
 padding: 80px 20px;
 text-align: center;
}

.Product-wrapper {
 max-width: 900px;
 margin: 40px auto 0;
 display: flex;
 flex-wrap: wrap;
 justify-content: center;
}

.App__view-cart-wrapper {
 float: right;
}

.App__view-cart {
 font-size: 15px;
 border: none;
 background: none;
 cursor: pointer;
 color: white;
}

.button {
 background-color: #2752ff;
 color: white;
 border: none;
 font-size: 1.2rem;
 padding: 10px 17px;
 cursor: pointer;
}

.button:hover,
.button:focus {
 background-color: #222222;
}

.button:disabled {
 background: #bfbfbf;
 cursor: not-allowed;
}

.login {
 font-size: 1.2rem;
 color: #b8b8b8;
 cursor: pointer;
}

.login:hover {
 color: white;
}

.Flash__message-wrapper {
 -webkit-justify-content: center;
 -ms-flex-pack: center;
 align-items: flex-end;
 justify-content: center;
 position: fixed;
 bottom: 0;
 pointer-events: none;
 z-index: 227;
 left: 50%;
 transform: translateX(-50%);
}

.Flash__message {
 background: rgba(0,0,0,0.88);
 border-radius: 3px;
 box-shadow: 0 2px 4px rgba(0,0,0,0.1);
 color: #ffffff;
 cursor: default;
 display: -webkit-flex;
 display: -ms-flexbox;
 display: none;
 pointer-events: auto;
 position: relative;
 font-size: 20px;
 line-height: 28px;
 font-weight: 400;
 padding: 10px 20px;
 margin: 0;
}

.Flash__message--open {
 display: flex;
}

/* CART
* ============================== */
.Cart {
 position: fixed;
 top: 0;
 right: 0;
 height: 100%;
 width: 350px;
 background-color: white;
 display: flex;
 flex-direction: column;
 border-left: 1px solid #e5e5e5;
 transform: translateX(100%);
 transition: transform 0.15s ease-in-out;
}

.Cart--open {
 transform: translateX(0);
}

.Cart__close {
 position: absolute;
 right: 9px;
 top: 8px;
 font-size: 35px;
 color: #999;
 border: none;
 background: transparent;
 transition: transform 100ms ease;
 cursor: pointer;
}

.Cart__header {
 padding: 20px;
 border-bottom: 1px solid #e5e5e5;
 flex: 0 0 auto;
 display: inline-block;
}

.Cart__line-items {
 flex: 1 0 auto;
 margin: 0;
 padding: 20px;
}

.Cart__footer {
 padding: 20px;
 border-top: 1px solid #e5e5e5;
 flex: 0 0 auto;
}

.Cart__checkout {
 margin-top: 20px;
 display: block;
 width: 100%;
}

.Cart-info {
 padding: 15px 20px 10px;
}

.Cart-info__total {
 float: left;
 text-transform: uppercase;
}

.Cart-info__small {
 font-size: 11px;
}

.Cart-info__pricing {
 float: right;
}

.pricing {
 margin-left: 5px;
 font-size: 16px;
 color: black;
}

/* LINE ITEMS
* ============================== */
.Line-item {
 margin-bottom: 20px;
 overflow: hidden;
 backface-visibility: visible;
 min-height: 65px;
 position: relative;
 opacity: 1;
 transition: opacity 0.2s ease-in-out;
}

.Line-item__img {
 width: 65px;
 height: 65px;
 border-radius: 3px;
 background-size: contain;
 background-repeat: no-repeat;
 background-position: center center;
 background-color: #e5e5e5;
 position: absolute;
}

.Line-item__content {
 width: 100%;
 padding-left: 75px;
}

.Line-item__content-row {
 display: inline-block;
 width: 100%;
 margin-bottom: 5px;
 position: relative;
}

.Line-item__variant-title {
 float: right;
 font-weight: bold;
 font-size: 11px;
 line-height: 17px;
 color: #767676;
}

.Line-item__title {
 color: #4E5665;
 font-size: 15px;
 font-weight: 400;
}

.Line-item__price {
 line-height: 23px;
 float: right;
 font-weight: bold;
 font-size: 15px;
 margin-right: 40px;
}

.Line-item__quantity-container {
 border: 1px solid #767676;
 float: left;
 border-radius: 3px;
}

.Line-item__quantity-update {
 color: #767676;
 display: block;
 float: left;
 height: 21px;
 line-height: 16px;
 font-family: monospace;
 width: 25px;
 padding: 0;
 border: none;
 background: transparent;
 box-shadow: none;
 cursor: pointer;
 font-size: 18px;
 text-align: center;
}

.Line-item__quantity-update-form {
 display: inline;
}

.Line-item__quantity {
 color: black;
 width: 38px;
 height: 21px;
 line-height: 23px;
 font-size: 15px;
 border: none;
 text-align: center;
 -moz-appearance: textfield;
 background: transparent;
 border-left: 1px solid #767676;
 border-right: 1px solid #767676;
 display: block;
 float: left;
 padding: 0;
 border-radius: 0;
}

.Line-item__remove {
 position: absolute;
 right: 0;
 top: 0;
 border: 0;
 background: 0;
 font-size: 20px;
 top: -4px;
 opacity: 0.5;
}

.Line-item__remove:hover {
 opacity: 1;
 cursor: pointer;
}

/* PRODUCTS
* ============================== */
.Product {
 flex: 0 1 31%;
 margin-left: 1%;
 margin-right: 1%;
 margin-bottom: 3%;
}

.Product__title {
 font-size: 1.3rem;
 margin-top: 1rem;
 margin-bottom: 0.4rem;
 opacity: 0.7;
}

.Product__price {
 display: block;
 font-size: 1.1rem;
 opacity: 0.5;
 margin-bottom: 0.4rem;
}

.Product__option {
 display: block;
 width: 100%;
 margin-bottom: 10px;
}

.Product__quantity {
 display: block;
 width: 15%;
 margin-bottom: 10px;
}

/* CUSTOMER AUTH
* ============================== */
.CustomerAuth {
 background: #2a2c2e;
 display: none;
 height: 100%;
 left: 0;
 opacity: 0;
 padding: 0 0 65px;
 top: 0;
 width: 100%;
 text-align: center;
 color: #fff;
 transition: opacity 150ms;
 opacity: 1;
 visibility: visible;
 z-index: 1000;
 position: fixed;
}

.CustomerAuth--open {
 display: block;
}

.CustomerAuth__close {
 position: absolute;
 right: 9px;
 top: 8px;
 font-size: 35px;
 color: #999;
 border: none;
 background: transparent;
 transition: transform 100ms ease;
 cursor: pointer;
}

.CustomerAuth__body {
 padding: 130px 30px;
 width: 700px;
 margin-left: auto;
 margin-right: auto;
 text-align: left;
 position: relative;
}

.CustomerAuth__heading {
 font-size: 24px;
 font-weight: 500;
 padding-bottom: 15px;
}

.CustomerAuth__credential {
 display: block;
 position: relative;
 margin-bottom: 15px;
 border-radius: 3px;
}

.CustomerAuth__input {
 height: 60px;
 padding: 24px 10px 20px;
 border: 0px;
 font-size: 18px;
 background: #fff;
 width: 100%;
}

.CustomerAuth__submit {
 float: right;
}

.error {
 display: block;
 font-size: 15px;
 padding: 10px;
 position: relative;
 min-height: 2.64286em;
 background: #fbefee;
 color: #c23628;
}
        `}</style>
        <div className="App">
          <div className="Flash__message-wrapper">
            <p className={`Flash__message ${this.state.accountVerificationMessage ? 'Flash__message--open' : ''}`}>We have sent you an email, please click the link included to verify your email address</p>
          </div>
          <CustomerAuthWithMutation
            closeCustomerAuth={this.closeCustomerAuth}
            isCustomerAuthOpen={this.state.isCustomerAuthOpen}
            newCustomer={this.state.isNewCustomer}
            associateCustomerCheckout={this.associateCustomerCheckout}
            showAccountVerificationMessage={this.showAccountVerificationMessage}
          />
          <header className="App__header">
            <ul className="App__nav">
              <li className="button App__customer-actions" onClick={this.openCustomerAuth} data-customer-type="new-customer">Create an Account</li>
              <li className="login App__customer-actions" onClick={this.openCustomerAuth}>Log in</li>
            </ul>
            {!this.state.isCartOpen &&
              <div className="App__view-cart-wrapper">
                <button className="App__view-cart" onClick={()=> this.setState({isCartOpen: true})}>Cart</button>
              </div>
            }
            <div className="App__title">
              <h1>{this.props.data.shop.name}: React Example</h1>
              <h2>{this.props.data.shop.description}</h2>
            </div>
          </header>
          <div className="Product-wrapper">
            { this.props.data.shop.products.edges.map(product =>
              <Product addVariantToCart={this.addVariantToCart} checkout={this.state.checkout} key={product.node.id.toString()} product={product.node} />
            )}
          </div>
          <Cart
            removeLineItemInCart={this.removeLineItemInCart}
            updateLineItemInCart={this.updateLineItemInCart}
            checkout={this.state.checkout}
            isCartOpen={this.state.isCartOpen}
            handleCartClose={this.handleCartClose}
            customerAccessToken={this.state.customerAccessToken}
          />
        </div>
      </div>
    )
  }
}

export default withShopifyApiDataAndMutation(App)
