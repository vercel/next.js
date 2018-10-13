import React, { Component } from "react";
import { withCustomerAuthMutation } from "../stores/shopifyCustomerAuthApi";

interface IOwnProps {
  associateCustomerCheckout:(accessToken:string) => void;
  closeCustomerAuth:() => void;
  customerAccessTokenCreate:(args:any) => any;
  customerCreate:(args:any) => any;
  isCustomerAuthOpen:boolean;
  newCustomer:boolean;
  showAccountVerificationMessage:() => void;
}

interface IOwnState {
  // email:string;
  // emailErrorMessage:string | null;
  // nonFieldErrorMessage:string | null;
  // password:string;
  // passwordErrorMessage:string | null;
  [name:string]:string | null;
}

class CustomerAuth extends Component<IOwnProps, IOwnState> {
  constructor(props) {
    super(props);
    this.state = {
      email: "",
      emailErrorMessage: null,
      nonFieldErrorMessage: null,
      password: "",
      passwordErrorMessage: null,
    };
  }

  public handleInputChange(event) {
    const target = event.target;
    const value = target.value;
    const name = target.name;

    this.setState({ [name]: value });
  }

  public resetErrorMessages() {
    this.setState({
      emailErrorMessage: null,
      nonFieldErrorMessage: null,
      passwordErrorMessage: null,
    });
  }

  public resetInputFields() {
    this.setState({
      email: "",
      password: "",
    });
  }

  public handleSubmit(email, password) {
    this.resetErrorMessages();
    if (this.props.newCustomer) {
      this.createCustomerAccount(email, password);
    } else {
      this.loginCustomerAccount(email, password);
    }
  }

  public createCustomerAccount(email, password) {
    const input = {
      email,
      password,
    };
    this.props.customerCreate({
      variables: { input },
    }).then((res) => {
      if (res.data.customerCreate.customer) {
        this.props.closeCustomerAuth();
        this.props.showAccountVerificationMessage();
      } else {
        res.data.customerCreate.userErrors.forEach((error) => {
          if (error.field) {
            this.setState({
              [error.field + "ErrorMessage"]: error.message,
            });
          } else {
            this.setState({
              nonFieldErrorMessage: error.message,
            });
          }
        });
      }
    });
  }

  public loginCustomerAccount(email, password) {
    const input = {
      email,
      password,
    };
    this.props.customerAccessTokenCreate({
      variables: { input },
    }).then((res) => {
      if (res.data.customerAccessTokenCreate.customerAccessToken) {
        this.props.associateCustomerCheckout(res.data.customerAccessTokenCreate.customerAccessToken.accessToken);
      } else {
        res.data.customerAccessTokenCreate.userErrors.forEach((error) => {
          if (error.field != null) {
            this.setState({
              [error.field + "ErrorMessage"]: error.message,
            });
          } else {
            this.setState({
              nonFieldErrorMessage: error.message,
            });
          }
        });
      }
    });
  }

  public render() {
    return (
      <div className={`CustomerAuth ${this.props.isCustomerAuthOpen ? "CustomerAuth--open" : ""}`}>
        <button
          onClick={() => {
            this.props.closeCustomerAuth();
            this.resetErrorMessages();
            this.resetInputFields();
          }}
          className="CustomerAuth__close"
        >
          ×
        </button>
        <div className="CustomerAuth__body">
          <h2 className="CustomerAuth__heading">
            {this.props.newCustomer ? "Create your Account" : "Log in to your account"}
          </h2>
          {this.state.nonFieldErrorMessage &&
            <div className="error">{this.state.nonFieldErrorMessage}</div>
          }
          <label className="CustomerAuth__credential">
            <input
              className="CustomerAuth__input"
              type="email"
              placeholder="Email"
              name={"email"}
              value={this.state.email!}
              onChange={this.handleInputChange}
            />
            {this.state.emailErrorMessage &&
              <div className="error">{this.state.emailErrorMessage}</div>
            }
          </label>
          <label className="CustomerAuth__credential">
            <input
              className="CustomerAuth__input"
              type="password"
              placeholder="Password"
              name={"password"}
              value={this.state.password!}
              onChange={this.handleInputChange}
            />
            {this.state.passwordErrorMessage &&
              <div className="error">{this.state.passwordErrorMessage}</div>
            }
          </label>
          <button
            className="CustomerAuth__submit button"
            type="submit"
            onClick={() => this.handleSubmit(this.state.email, this.state.password)}
          >
            {this.props.newCustomer ? "Create Account" : "Log in"}
          </button>
        </div>
      </div>
    );
  }
}

const CustomerAuthWithMutation = withCustomerAuthMutation(CustomerAuth);
export { CustomerAuthWithMutation };
