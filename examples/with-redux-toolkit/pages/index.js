import React from 'react';
import { useDispatch } from 'react-redux';

import Clock from '../components/clock';
import Counter from '../components/counter';
import { tick } from '../lib/slices/clockSlice';
import useInterval from '../lib/useInterval';

const IndexPage = () => {
  // Use state or dispatch here
  const dispatch = useDispatch();
  // Tick the time every second
  useInterval(() => {
    dispatch(tick(true));
  }, 1000);

  return (
    <>
      <Clock />
      <Counter />
    </>
  );
};

export default IndexPage;
