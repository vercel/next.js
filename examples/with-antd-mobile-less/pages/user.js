import React from 'react';
import { List, InputItem, WhiteSpace } from 'antd-mobile';
import Layout from '../components/layout';

class UserPage extends React.Component {

    render() {
        return (
            <Layout active="User">
                <>
                    <h3>Next Page </h3>

                    <WhiteSpace />
                    <List>
                        <InputItem placeholder="input something">Input Item</InputItem>
                    </List>
                </>
            </Layout>
        )
    }
}

export default UserPage;