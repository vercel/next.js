import {Card} from "antd";
import Header from "../components/Header";
import Layout from '../index.js'

export default () => (
    <Layout style={{marginTop: 100}}>
        <Header/>
        <Card
            title="Card title"
            extra={<a href="#">More</a>}
            style={{width: 300}}
        >
            <p>Card content</p>
            <p>Card content</p>
            <p>Card content</p>
        </Card>
    </Layout>
);
