import { Component } from "react";
import Router from "next/router";
import Header from "../components/Header";

export default class extends Component {
  render() {
    return (
      <div>
        <Header />
        <p>
          This path(
          {Router.pathname}) should not be rendered via SSR
        </p>
      </div>
    );
  }
}
