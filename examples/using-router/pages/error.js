import { Component } from "react";
import Router from "next/router";
import Header from "../components/Header";

export default class extends Component {
  static getInitialProps() {
    console.log(Router.pathname);
    return {};
  }

  render() {
    return (
      <div>
        <Header />
        <p>This should not be rendered via SSR</p>
      </div>
    );
  }
}
