// components
import Page from '../components/Page';

// store
import { initStore, withMobX } from '../store';


export default withMobX('store', initStore)(({ store }) => (
    // MobX store is available as `store` property of props argument to wrapped
    // function component
    <div>
      <Page title='Other Page' linkTo='/'/>
      <p>Raw clock: &nbsp;
        {store.lastUpdate}</p>
    </div>
));
