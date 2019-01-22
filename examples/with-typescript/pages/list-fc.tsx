import { NextFunctionComponent, NextContext } from 'next'
import Layout from '../components/Layout'
import List from '../components/List'
import IDataObject from '../interfaces'

interface IListComponentProps {
    items: IDataObject[]
}

const list: NextFunctionComponent<IListComponentProps> = ({ items }) => (
    <Layout title="About | Next.js + TypeScript Example">
        <List items={ items }/>
    </Layout>
)

list.getInitialProps = async ({ pathname }: NextContext) => {
    const dataArray: IDataObject[] =
        [{ id: 101, name: 'larry' }, { id: 102, name: 'sam' }, { id: 103, name: 'jill' }, { id: 104, name: pathname }]

    return { items: dataArray }
}

export default list
