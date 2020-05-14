import React from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { decrement, increment, reset, selectCount } from '../lib/slices/counterSlice';

const Counter = () => {
  const dispatch = useDispatch();
  const count = useSelector(selectCount);

  function dispatchIncrement() {
    dispatch(increment());
  }
  function dispatchDecrement() {
    dispatch(decrement());
  }
  function dispatchReset() {
    dispatch(reset());
  }

  return (
    <>
      <h1>
        Count: <span>{count}</span>
      </h1>
      <button onClick={dispatchIncrement}>+1</button>
      <button onClick={dispatchDecrement}>-1</button>
      <button onClick={dispatchReset}>Reset</button>
    </>
  );
};

export default Counter;
