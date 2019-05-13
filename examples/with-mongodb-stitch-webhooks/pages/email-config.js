import React from 'react';
import { connect } from 'react-redux';

class Index extends React.Component {
    static getInitialProps ({ reduxStore, req }) {
        const isServer = !!req;

        return {}
    }

    componentDidMount () {
        if (process.browser) {
        }
    }

    componentWillUnmount () {
    }

    render () {
        return <p>Email config...</p>
    }
}

export default connect()(Index)
