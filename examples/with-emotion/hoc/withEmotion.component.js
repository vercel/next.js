import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { loadGetInitialProps } from 'next/dist/lib/utils';
import Head from 'next/head';
import { injectGlobalStyles } from '../shared/styles';
import { hydrate } from 'react-emotion';

const withEmotion = ComposedComponent => {
  class HOC extends Component {

      componentWillMount() {
        if (typeof window !== 'undefined') {
          hydrate(window.__NEXT_DATA__.ids);
        }

        injectGlobalStyles()
      }

      render() {
        return (
            <ComposedComponent />
        );

      }
  };

  return HOC;
};

export default withEmotion;

