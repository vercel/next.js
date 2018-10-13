import Link from "next/link";
import React, { ChangeEvent, Component } from "react";
import { VariantSelector } from "./VariantSelector";

interface IOwnProps {
  addVariantToCart:(id:string, variantQuantity:number) => void;
  product:any;
}

interface IOwnState {
  selectedOptions:any;
  selectedVariant:string;
  selectedVariantImage:string;
  selectedVariantQuantity:number;
}

class Product extends Component<IOwnProps, IOwnState> {
  constructor(props) {
    super(props);
    this.state = {
      selectedOptions:null,
      selectedVariant:"",
      selectedVariantImage:"",
      selectedVariantQuantity:1,
    };
  }

  public componentWillMount() {
    this.props.product.options.forEach((selector) => {
      this.setState({
        selectedOptions: { [selector.name]: selector.values[0] },
      });
    });
  }

  public findImage(images, variantId) {
    const primary = images[0];
    const image = images.filter((img) => {
      return img.variant_ids.includes(variantId);
    })[0];
    return (image || primary).src;
  }

  public handleOptionChange(event:ChangeEvent<HTMLSelectElement>) {
    const target = event.target;
    const selectedOptions = this.state.selectedOptions;
    selectedOptions[target.name] = target.value;
    const selectedVariant = this.props.product.variants.edges.find((variant) => {
      return variant.node.selectedOptions.every((selectedOption) => {
        return selectedOptions[selectedOption.name] === selectedOption.value;
      });
    }).node;
    this.setState({
      selectedVariant,
      selectedVariantImage: selectedVariant.image.src,
    });
  }

  public handleQuantityChange(event) {
    this.setState({
      selectedVariantQuantity: event.target.value,
    });
  }

  public render() {
    const variantImage = this.state.selectedVariantImage || this.props.product.images.edges[0].node.src;
    const variant = this.state.selectedVariant || this.props.product.variants.edges[0].node;
    const variantQuantity = this.state.selectedVariantQuantity || 1;
    const variantSelectors = this.props.product.options.map((option) => {
      return (
        <VariantSelector
          handleOptionChange={this.handleOptionChange}
          key={option.id.toString()}
          option={option}
        />
      );
    });
    return (
      <div className="Product">
        {this.props.product.images.edges.length ? <img src={variantImage} alt={`${this.props.product.title} product shot`}/> : null}
        <Link
          href={"/product?id=" + this.props.product.id}
          as={"/product/" + this.props.product.id}
        >
          <a>
            <h5 className="Product__title">{this.props.product.title}</h5>
          </a>
        </Link>
        <span className="Product__price">${variant.price}</span>
        {variantSelectors}
        <label className="Product__option">
          Quantity
          <input
            min="1"
            type="number"
            defaultValue={String(variantQuantity)}
            onChange={this.handleQuantityChange}
          />
        </label>
        <Link
          href={"/product?id=" + this.props.product.id}
          as={"/product/" + this.props.product.id}
        >
          <button className="Product__buy button">
            Details
          </button>
        </Link>
        <button
          className="Product__buy button"
          onClick={() => this.props.addVariantToCart(variant.id, variantQuantity)}
        >
          Add to Cart
        </button>
      </div>
    );
  }
}

export { Product };
