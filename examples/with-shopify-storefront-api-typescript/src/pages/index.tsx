import React, { Component, MouseEvent } from "react";
import { Cart } from "../components/Cart";
import { CustomerAuthWithMutation } from "../components/CustomerAuth";
import { Product } from "../components/Product";
import {
  addVariantToCart,
  associateCustomerCheckout,
  removeLineItemInCart,
  updateLineItemInCart,
  withShopifyApiDataAndMutation,
} from "../stores/ShopifyCheckoutApi";

interface IOwnProps {
  // BEGIN from withShopifyApiDataAndMutation
  checkoutLineItemsAdd:() => void;
  checkoutLineItemsUpdate:() => void;
  createCheckout:(args:any) => any;
  data:{
    error:any;
    loading:boolean;
    shop:any;
  };
  // END
}

interface IOwnState {
  accountVerificationMessage:boolean;
  checkout:any;
  isCartOpen:boolean;
  isCustomerAuthOpen:boolean;
  isNewCustomer:boolean;
}

class App extends Component<IOwnProps, IOwnState> {
  constructor(props) {
    super(props);
    this.state = {
      accountVerificationMessage: false,
      checkout: { lineItems: { edges: [] } },
      isCartOpen: false,
      isCustomerAuthOpen: false,
      isNewCustomer: false,
    };
  }

  public associateCustomerCheckoutHelper = (customerAccessToken) => {
    associateCustomerCheckout(this, customerAccessToken);
  }

  public addVariantToCartHelper = (variantId, quantity) => {
    addVariantToCart(this, variantId, quantity);
  }

  public removeLineItemInCartHelper = (lineItemId) => {
    removeLineItemInCart(this, lineItemId);
  }

  public updateLineItemInCartHelper = (lineItemId, quantity) => {
    updateLineItemInCart(this, lineItemId, quantity);
  }

  public componentWillMount() {
    this.props.createCheckout({
      variables: {
        input: {},
      },
    }).then((res) => {
      this.setState({
        checkout: res.data.checkoutCreate.checkout,
      });
    });
  }

  public handleCartOpen = () => {
    this.setState({
      isCartOpen: true,
    });
  }

  public handleCartClose = () => {
    this.setState({
      isCartOpen: false,
    });
  }

  public openCustomerAuth = (event:MouseEvent<HTMLLIElement>) => {
    if ((event.target as any).getAttribute("data-customer-type") === "new-customer") {
      this.setState({
        isCustomerAuthOpen: true,
        isNewCustomer: true,
      });
    } else {
      this.setState({
        isCustomerAuthOpen: true,
        isNewCustomer: false,
      });
    }
  }

  public showAccountVerificationMessage = () => {
    this.setState({ accountVerificationMessage: true });
    setTimeout(() => {
      this.setState({
        accountVerificationMessage: false,
      });
    }, 5000);
  }

  public closeCustomerAuth = () => {
    this.setState({
      isCustomerAuthOpen: false,
    });
  }

  public render() {
    if (this.props.data.loading) {
      return <p>Loading ...</p>;
    }
    if (this.props.data.error) {
      return <p>{this.props.data.error.message}</p>;
    }

    return (
      <div>
        <div className="App">
          <div className="Flash__message-wrapper">
            <p className={`Flash__message ${this.state.accountVerificationMessage ? "Flash__message--open" : ""}`}>We have sent you an email, please click the link included to verify your email address</p>
          </div>
          <CustomerAuthWithMutation
            closeCustomerAuth={this.closeCustomerAuth}
            isCustomerAuthOpen={this.state.isCustomerAuthOpen}
            newCustomer={this.state.isNewCustomer}
            associateCustomerCheckout={this.associateCustomerCheckoutHelper}
            showAccountVerificationMessage={this.showAccountVerificationMessage}
          />
          <header className="App__header">
            <ul className="App__nav">
              <li className="button App__customer-actions" onClick={this.openCustomerAuth} data-customer-type="new-customer">Create an Account</li>
              <li className="login App__customer-actions" onClick={this.openCustomerAuth}>Log in</li>
            </ul>
            {!this.state.isCartOpen &&
              <div className="App__view-cart-wrapper">
                <button className="App__view-cart" onClick={() => this.setState({ isCartOpen: true })}>Cart</button>
              </div>
            }
            <div className="App__title">
              <h1>{this.props.data.shop.name}: React Example</h1>
              <h2>{this.props.data.shop.description}</h2>
            </div>
          </header>
          <div className="Product-wrapper">
            {
              this.props.data.shop.products.edges.map((product) =>
                <Product
                  addVariantToCart={this.addVariantToCartHelper}
                  key={product.node.id.toString()}
                  product={product.node}
                />,
              )
            }
          </div>
          <Cart
            removeLineItemInCart={this.removeLineItemInCartHelper}
            updateLineItemInCart={this.updateLineItemInCartHelper}
            checkout={this.state.checkout}
            isCartOpen={this.state.isCartOpen}
            handleCartClose={this.handleCartClose}
          />
        </div>
      </div>
    );
  }
}

export default withShopifyApiDataAndMutation(App);
