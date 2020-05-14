import React from 'react';
import { connect } from 'react-redux';

import Clock from '../components/clock';
import Counter from '../components/counter';
import { tick } from '../lib/slices/clockSlice';
import useInterval from '../lib/useInterval';

const IndexPage = ({ dispatch }) => {
  // Use state or dispatch here

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

export default connect(state => state)(IndexPage);
