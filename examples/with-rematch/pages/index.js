import { useSelector, useDispatch } from "react-redux";
import Header from "../shared/components/header";
import { useRematchDispatch } from "../shared/utils";

const Home = () => {
  const counter = useSelector((state) => state.counter);
  const dispatch = useDispatch();
  const { increment } = useRematchDispatch((dispatch) => ({
    increment: dispatch.counter.increment,
  }));

  return (
    <div>
      <Header />
      <h1> Counter </h1>
      <h3>The count is {counter}</h3>
      <p>
        <button onClick={dispatch.counter.increment}>increment</button>
        <button onClick={() => increment(1)}>
          increment (using dispatch function)
        </button>
        <button onClick={() => increment(5)}>increment by 5</button>
        <button onClick={dispatch.counter.incrementAsync}>
          incrementAsync
        </button>
      </p>
      <br />
    </div>
  );
};

export default Home;
