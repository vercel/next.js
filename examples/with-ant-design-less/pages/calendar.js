import {Calendar} from "antd";
import Header from "../components/Header";
import Layout from '../index.js'

function onPanelChange(value, mode) {
    console.log(value, mode);
}

export default () => (
    <Layout style={{marginTop: 100}}>
        <Header/>
        <Calendar onPanelChange={onPanelChange}/>
    </Layout>
);
