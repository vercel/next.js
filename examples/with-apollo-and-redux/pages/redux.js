import React from "react";
import { bindActionCreators } from "redux";
import withRedux from "next-redux-wrapper";
import {
  initStore,
  startClock,
  addCount,
  serverRenderClock
} from "../lib/store";

import App from "../components/App";
import Header from "../components/Header";
import Page from "../components/Page";

class Index extends React.Component {
  static getInitialProps({ store, isServer }) {
    store.dispatch(serverRenderClock(isServer));
    store.dispatch(addCount());

    return { isServer };
  }

  componentDidMount() {
    this.timer = this.props.startClock();
  }

  componentWillUnmount() {
    clearInterval(this.timer);
  }

  render() {
    return (
      <App>
        <Header />
        <Page title="Redux" />
      </App>
    );
  }
}

const mapDispatchToProps = dispatch => ({
  addCount: bindActionCreators(addCount, dispatch),
  startClock: bindActionCreators(startClock, dispatch)
});

export default withRedux(initStore, null, mapDispatchToProps)(Index);
