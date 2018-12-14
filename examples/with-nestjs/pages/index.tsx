import React from 'react';
import fetch from 'isomorphic-unfetch'
import Link from 'next/link'
import Layout from '../components/Layout';

interface IState {
  cats?: any[];
  pages?: number;
  loading?: boolean;
}

class App extends React.Component {

  state: IState = {
    cats: [],
    pages: null,
    loading: false
  };

  constructor(props) {
    super(props);
    this.state = {
      cats: []
    };
    this.fetchData();
  }

  fetchData = () => {
    
    // const loading = message.loading('Action in progress..', 0);
    fetch(`/api/cats`)
      .then(response => {
        if (!response.ok) {
          throw Error(response.statusText);
        }
        return response.json()
      })
      .then(response => {
        if (!response || response.length == 0) {
          // message.error('I do not find any book with these terms', 3);
        } else {
          this.setState({ cats: response.data });
        }
        // setTimeout(loading, 250);
      })
      .catch(function (error) {
        // message.error(error, 3);
      });
  }

  render() {
    const { cats } = this.state;
    return (
      <Layout title="Home | Next.js + TypeScript Example">
        <h1>Hello Next.js 👋</h1>
        <div>
           {cats.map(cat => <div> {cat.name} </div>)} 
        </div>
        <p><Link href='/about'><a>About</a></Link></p>
      </Layout>
    );
  }
}

export default App;