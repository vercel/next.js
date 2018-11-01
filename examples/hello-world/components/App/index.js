import React, { Component } from "react";
import { connect } from "react-redux";
//import setSite from "../../action/site";
import "./index.scss";
import fetch from "isomorphic-unfetch";
class App extends Component {
  static async getInitialProps() {
    //const res = await fetch("https://m34l1yp1mj.sse.codesandbox.io/api/insure");
    //const json = await res.json();
    //alert(res);
    alert(2015);
    return { list: 2018 };
  }
  constructor(props) {
    super(props);
    this.state = { title: "" };
    this.handleChange = this.handleChange.bind(this);
    this.submit = this.submit.bind(this);
  }
  handleChange(event) {
    this.setState({
      title: event.target.value
    });
  }
  submit() {
    this.props.changeTitle(this.state.title);
  }
  render() {
    return (
      <div>
        <h5>
          {this.props.list}App {this.props.title}{" "}
        </h5>
        <input type="text" onChange={this.handleChange} />
        <button onClick={this.submit}>Change</button>
      </div>
    );
  }
}
const mapStateToProps = state => {
  return { title: state.site.title };
};
const mapDispatchToProps = dispatch => {
  return {
    changeTitle: value => {
      dispatch({ type: "SET_TITLE", title: value });
    }
  };
};
App.getInitialProps = async ({ req }) => {
  alert(99);
  //const res = await fetch("https://m34l1yp1mj.sse.codesandbox.io/api/insure");
  //const json = await res.json();
  //console.log(json, 33333333331);
  alert(0);
  return {};
  //return { stars: json.stargazers_count };
};
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(App);
