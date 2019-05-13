import React from 'react';
import {connect} from 'react-redux';

class Index extends React.Component {
    static getInitialProps({reduxStore, req}) {
        const isServer = !!req;

        return {}
    }

    componentDidMount() {
    }

    componentWillUnmount() {
    }

    render() {
        return <p>Reset password page...</p>
    }
}

export default connect()(Index)
