import {BaseStore, getOrCreateStore} from 'next-mobx-wrapper';
import {observable, action, computed} from 'mobx';

class Store extends BaseStore {
  @observable count = 10;

  @action.bound increment() {
    this.count++;
  }

  @action.bound decrement() {
    this.count--;
  }
}

// Make sure the store’s unique name
// AND getCounterStore, counterStore must be same formula
// Example: getUserStore => userStore
// Example: getProductStore => productStore
export const getCounterStore = getOrCreateStore('counterStore', Store);
