import React from 'react';

import { compose } from 'redux';
import { connect } from 'react-redux';
import { createStructuredSelector } from 'reselect';

import injectSaga from 'utils/injectSaga';
import injectReducer from 'utils/injectReducer';

import saga from './saga';
import reducer from './reducer';
import { getDataGraphs } from './actions';
import {
  selectData
} from './selectors';

export class Example extends React.Component {

  componentDidMount() {
    const { getDataGraphs } = this.props;

    getDataGraphs();
  }

  render() {
    const { data } = this.props;

    return (
      <div>
        <pre>
          Text in a pre element
          is displayed in a fixed-width
          font, and it preserves
          both      spaces and
          line breaks
</pre>
      </div>
    );
  }
}

const mapStateToProps = createStructuredSelector({
  data: selectData,
});

export function mapDispatchToProps(dispatch) {
  return { getDataGraphs: () => dispatch(getDataGraphs()) };
}

const withConnect = connect(
  mapStateToProps,
  mapDispatchToProps
);

const withSaga = injectSaga({ key: 'example', saga });
const withReducer = injectReducer({ key: 'example', reducer });

export default compose(
  withReducer,
  withSaga,
  withConnect
)(Example);
