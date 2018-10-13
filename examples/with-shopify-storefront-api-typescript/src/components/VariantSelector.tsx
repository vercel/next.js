import React, { ChangeEvent, Component } from "react";

interface IOwnProps {
  handleOptionChange:(event:ChangeEvent<HTMLSelectElement>) => void;
  option:any;
}

class VariantSelector extends Component<IOwnProps> {
  public render() {
    return (
      <select
        className="Product__option"
        name={this.props.option.name}
        key={this.props.option.name}
        onChange={this.props.handleOptionChange}
      >
        {this.props.option.values.map((value) => {
          return (
            <option
              value={value}
              key={`${this.props.option.name}-${value}`}
            >
              {`${value}`}
            </option>
          );
        })}
      </select>
    );
  }
}

export { VariantSelector };
