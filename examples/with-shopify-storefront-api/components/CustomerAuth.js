import React, {Component} from 'react'
import PropTypes from 'prop-types'
import withCustomerAuthMutation from '../stores/shopifyCustomerAuthApi'

class CustomerAuth extends Component {
  constructor(props) {
    super(props);
    this.state = {
      email: '',
      password: '',
      nonFieldErrorMessage: null,
      emailErrorMessage: null,
      passwordErrorMessage: null
    };

    this.handleInputChange = this.handleInputChange.bind(this)
    this.createCustomerAccount = this.createCustomerAccount.bind(this)
    this.resetErrorMessages = this.resetErrorMessages.bind(this)
    this.resetInputFields = this.resetInputFields.bind(this)
  }

  static propTypes = {
    customerCreate: PropTypes.func.isRequired,
    customerAccessTokenCreate: PropTypes.func.isRequired,
  }

  handleInputChange(event) {
    const target = event.target
    const value = target.value
    const name = target.name

    this.setState({[name]: value})
  }

  resetErrorMessages(){
    this.setState({
      nonFieldErrorMessage: null,
      emailErrorMessage: null,
      passwordErrorMessage: null
    })
  }

  resetInputFields(){
    this.setState({
      email: '',
      password: ''
    })
  }

  handleSubmit(email, password){
    this.resetErrorMessages()
    if (this.props.newCustomer) {
      this.createCustomerAccount(email, password)
    } else {
      this.loginCustomerAccount(email, password)
    }
  }

  createCustomerAccount(email, password){
    const input = {
      email: email,
      password: password
    }
    this.props.customerCreate(
      { variables: { input }
      }).then((res) => {
        if (res.data.customerCreate.customer){
           this.props.closeCustomerAuth();
           this.props.showAccountVerificationMessage();
        } else {
          res.data.customerCreate.userErrors.forEach(function (error) {
            if (error.field) {
              this.setState({
                [error.field + "ErrorMessage"]: error.message
              });
            } else {
              this.setState({
                nonFieldErrorMessage: error.message
              });
            }
          }.bind(this))
        }
    });
  }

  loginCustomerAccount(email, password){
    const input = {
      email: email,
      password: password
    }
    this.props.customerAccessTokenCreate(
      { variables: { input }
      }).then((res) => {
      if (res.data.customerAccessTokenCreate.customerAccessToken) {
        this.props.associateCustomerCheckout(res.data.customerAccessTokenCreate.customerAccessToken.accessToken);
      } else {
        res.data.customerAccessTokenCreate.userErrors.forEach(function (error) {
          if (error.field != null) {
            this.setState({
              [error.field + "ErrorMessage"]: error.message
            });
          } else {
            this.setState({
              nonFieldErrorMessage: error.message
            });
          }
        }.bind(this))
      }
    })
  }

  render() {
    return (
      <div className={`CustomerAuth ${this.props.isCustomerAuthOpen ? 'CustomerAuth--open' : ''}`}>
        <button
          onClick={() => { this.props.closeCustomerAuth(); this.resetErrorMessages(); this.resetInputFields();}}
          className="CustomerAuth__close">
          ×
        </button>
        <div className="CustomerAuth__body">
          <h2 className="CustomerAuth__heading">{this.props.newCustomer ? 'Create your Account' : 'Log in to your account'}</h2>
          {this.state.nonFieldErrorMessage &&
            <div className="error">{this.state.nonFieldErrorMessage}</div>
          }
          <label className="CustomerAuth__credential">
            <input className="CustomerAuth__input" type="email" placeholder="Email" name={"email"} value={this.state.email} onChange={this.handleInputChange}></input>
            {this.state.emailErrorMessage &&
              <div className="error">{this.state.emailErrorMessage}</div>
            }
          </label>
          <label className="CustomerAuth__credential">
            <input className="CustomerAuth__input" type="password" placeholder="Password" name={"password"} value={this.state.password} onChange={this.handleInputChange}></input>
            {this.state.passwordErrorMessage &&
              <div className="error">{this.state.passwordErrorMessage}</div>
            }
          </label>
          <button className="CustomerAuth__submit button" type="submit" onClick={() => this.handleSubmit(this.state.email, this.state.password)}>{this.props.newCustomer ? 'Create Account' : 'Log in'}</button>
        </div>
      </div>

    )
  }
}

export default withCustomerAuthMutation(CustomerAuth);
