import Reflux from "reflux";
import Actions from "../actions/actions";

export default class StatusStore extends Reflux.Store {
  constructor() {
    super();
    this.state = { counter: 0 };
    this.listenTo(Actions.increment, this.onIncrement);
    this.listenTo(Actions.decrement, this.onDecrement);
  }
  onIncrement() {
    this.setState({ counter: this.state.counter + 1 });
  }
  onDecrement() {
    this.setState({ counter: this.state.counter - 1 });
  }
}
