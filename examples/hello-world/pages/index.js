import Link from "next/link";
import React, { Component } from "react";
import { createStore, applyMiddleware } from "redux";
import { Provider } from "react-redux";
import rootReducers from "../reduces/index";
import App from "../components/App/index";

import "./index.scss";

const store = createStore(
  rootReducers
  //applyMiddleware
);
class Index extends Component {
  constructor(props) {
    super(props);
  }
  render() {
    return (
      <Provider store={store}>
        <App />
      </Provider>
    );
  }
}
export default Index;
