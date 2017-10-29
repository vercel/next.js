// modules
import { Component } from 'react';

// components
import Page from '../components/Page';

// store
import { initStore, withMobX } from '../store';


export default withMobX('store', initStore)(
    // MobX store is available within wrapped component at `this.props.store`
    class Index extends Component {
        render () {
            return (
                <div>
                  <Page title='Index Page' linkTo='/other'/>
                  <p>Raw clock: &nbsp;
                    {this.props.store.lastUpdate}</p>
                </div>
            );
        }
    }
);
