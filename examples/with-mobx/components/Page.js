// modules
import { inject, observer } from 'mobx-react';
import Link                 from 'next/link';
import { Component }        from 'react';

// components
import Clock from './Clock';


@inject('store') @observer
export default class extends Component {
    // MobX store is available within decorated component at `this.props.store`
    componentDidMount () {
        this.props.store.start();
    }

    componentWillUnmount () {
        this.props.store.stop();
    }

    render () {
        return (
            <div>
              <h1>{this.props.title}</h1>
              <Clock lastUpdate={this.props.store.lastUpdate}
                     light={this.props.store.light}/>
              <br/><br/>
              <nav>
                <Link href={this.props.linkTo}><a>Navigate</a></Link>
              </nav>
            </div>
        );
    }
}
