import React from 'react';
import fetch from 'isomorphic-unfetch'
import Link from 'next/link'
import Layout from '../components/Layout';

// Import React Table
import ReactTable from "react-table";
import "react-table/react-table.css";

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
    //this.fetchData();
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
      .then(data => {
        if (!data || data.length == 0) {
          // message.error('I do not find any book with these terms', 3);
        } else {
          this.setState({ cats: data });
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

         <ReactTable
          data={cats}
          columns={[
            {
              Header: "Name",
              columns: [
                {
                  Header: "First Name",
                  accessor: "firstName"
                },
                {
                  Header: "Last Name",
                  id: "lastName",
                  accessor: d => d.lastName
                }
              ]
            },
            {
              Header: "Info",
              columns: [
                {
                  Header: "Age",
                  accessor: "age"
                },
                {
                  Header: "Status",
                  accessor: "status"
                }
              ]
            },
            {
              Header: 'Stats',
              columns: [
                {
                  Header: "Visits",
                  accessor: "visits"
                }
              ]
            }
          ]}
          defaultPageSize={10}
          className="-striped -highlight"
        />


        <p><Link href='/about'><a>About</a></Link></p>
      </Layout>
    );
  }
}

export default App;