import Link from "next/link";
import React from "react";
import { withShopifyApiDataAndMutation } from "../stores/ShopifyCheckoutApi";

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
  id:string;
  // END
}

class ProductDetails extends React.Component<IOwnProps> {
  public static getInitialProps({ query: { id } }) {
    return { id };
  }

  public render() {
    if (this.props.data.loading) {
      return <p>Loading ...</p>;
    }
    if (this.props.data.error) {
      return <p>{this.props.data.error.message}</p>;
    }
    const edge = this.props.data.shop.products.edges.find((candidate) => {
      return candidate.node.id === this.props.id;
    });
    if (!edge) {
      return (
        <div>
          product not found
        </div>
      );
    }
    const product = edge.node;
    return (
      <div>
        <h1>Your awesome product details page goes here</h1>
        <p>
          Product title is {product.title}
        </p>
        <Link href={"/"}>
          <button className="Product__buy button">Back to catalog</button>
        </Link>
      </div>
    );
  }
}

export default withShopifyApiDataAndMutation(ProductDetails);
