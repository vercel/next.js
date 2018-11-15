import { inject, observer } from "mobx-react";
import Link from "next/link";
import React from "react";
import { IStore } from "../stores/store";
import { Clock } from "./Clock";

interface IOwnProps {
  store?:IStore;
  title:string;
  linkTo:string;
}

@inject("store")
@observer
class SampleComponent extends React.Component<IOwnProps> {
  public componentDidMount () {
    if (!this.props.store) {
      return;
    }
    this.props.store.start();
  }

  public componentWillUnmount () {
    if (!this.props.store) {
      return;
    }
    this.props.store.stop();
  }

  public render () {
    if (!this.props.store) {
      return (
        <div>
          Store not defined
        </div>
      );
    }
    return (
      <div>
        <h1>{this.props.title}</h1>
        <Clock lastUpdate={this.props.store.lastUpdate} light={this.props.store.light} />
        <nav>
          <Link href={this.props.linkTo}><a>Navigate</a></Link>
        </nav>
      </div>
    );
  }
}

export { SampleComponent };
