import React from 'react';
import {connect} from 'react-redux';
import Examples from '../components/examples';
import Link from 'next/link'
import {fetchCheck} from "../actions/api-actions";
import {bindActionCreators} from "redux";

class Index extends React.Component {
    constructor(props) {
        super(props);
    }

    static getInitialProps({reduxStore, req}) {
        const isServer = !!req;

        return {}
    }

    async componentDidMount() {
        if (process.browser) {
        }
    }

    componentWillUnmount() {
    }

    render() {
        return <div>
            <Link href="/reset">
                <button>Reset Password Page</button>
            </Link>
            <Link href="/email-config">
                <button>Email Config Page</button>
            </Link>
            <button onClick={() => this.props.fetchCheck()}>Fetch Check Api</button>
            <h3>{this.props.response && this.props.response.test}</h3>
            <Examples/>
        </div>
    }
}

function mapStateToProps(state) {
    const {response} = state.apiclient;
    return {response}
}

function mapDispatchToProps(dispatch) {
    return bindActionCreators(
        {
            fetchCheck
        },
        dispatch
    );
}

export default connect(mapStateToProps, mapDispatchToProps)(Index)
