import { Provider } from "mobx-react";
import { getSnapshot } from "mobx-state-tree";
import React from "react";
import { Page } from "../components/Page";
import { initStore, IStore } from "../store";

interface IOwnProps {
  isServer:boolean;
  initialState:IStore;
}

class Counter extends React.Component<IOwnProps> {
  public static getInitialProps ({ req }) {
    const isServer = !!req;
    const store = initStore(isServer);
    return { initialState: getSnapshot(store), isServer };
  }

  private store:IStore;

  constructor(props) {
    super(props);
    this.store = initStore(props.isServer, props.initialState) as IStore;
  }

  public render() {
    return (
      <Provider store={this.store}>
        <Page title="Other Page" linkTo="/" />
      </Provider>
    );
  }
}

export default Counter;
