import Head from 'next/head'
import { ToastContainer, toast } from 'react-toastify';
import * as React from "react";


class Home extends React.Component {

    constructor(props) {
        super(props);
        this.handleNewFeature = this.handleNewFeature.bind(this);
        this.handleNewEmail = this.handleNewEmail.bind(this);
        this.inputNewFeature = React.createRef();
        this.inputEmail = React.createRef();
        this.logo = process.env.LOGO ? process.env.LOGO : "/logo.png";
        this.props = props
        this.state = {
            error: null,
            isLoaded: false,
            items: []
        };
    }

    refreshData() {
        fetch("api/list")
            .then(res => res.json())
            .then(
                (result) => {
                    this.setState({
                        isLoaded: true,
                        items: result.body
                    });
                    this.inputNewFeature.current.value = "";
                },
                (error) => {
                    this.setState({
                        isLoaded: true,
                        error
                    });
                }
            )
    }

    vote(event, title) {
        const requestOptions = {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({"title": title})
        };
        fetch('api/vote', requestOptions)
            .then(response => response.json()).then(data => {
                if(data.error) {
                    toast.error(data.error, {hideProgressBar: true, autoClose: 3000});
                } else {
                    this.refreshData()
                }
        })
    }

    handleNewFeature(event) {
        const requestOptions = {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({"title": this.inputNewFeature.current.value})
        };
        fetch('api/create', requestOptions)
            .then(response => response.json()).then(data => {
            if(data.error) {
                toast.error(data.error, {hideProgressBar: true, autoClose: 5000});
            } else {
                toast.info("Your feature has been added to the list.", {hideProgressBar: true, autoClose: 3000});
                this.refreshData()
            }
        });
        event.preventDefault();
    }

    handleNewEmail(event) {
        const requestOptions = {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({"email": this.inputEmail.current.value})
        };
        fetch('api/addemail', requestOptions)
            .then(response => response.json()).then(data => {
            if(data.error) {
                toast.error(data.error, {hideProgressBar: true, autoClose: 3000});
            } else {
                toast.info("Your email has been added to the list.", {hideProgressBar: true, autoClose: 3000});
                this.refreshData()
            }
        });
        event.preventDefault();
    }

    componentDidMount() {
        this.refreshData();
    }

    render() {
        const {items} = this.state;

        return (
            <div className="container">
                <Head>
                    <title>Roadmap Voting</title>
                    <link rel="icon" href="/favicon.ico"/>
                </Head>

                <main>
                    <h1 className="title">
                        <img src={this.logo} alt="Logo" className="logo"/>
                    </h1>

                    <p className="description">
                        Help us by voting our roadmap.<br/>
                        <span className="blue">&#x25B2;</span>
                        Vote up the features you want to see in the next release.
                    </p>

                    <div className="grid">

                        {items.map((item, ind) => (
                            <div className="card" key={ind}>
                                <span>{item.title}</span>
                                <div className="upvotediv">
                                    <a onClick={(e) => this.vote(e, item.title)} href={"#" + item.title}>
                                        &#x25B2; {item.score}
                                    </a>
                                </div>
                            </div>
                        ))}

                        <div className="card">
                            <form onSubmit={this.handleNewFeature}>
                                <input type="text" className="noborder" ref={this.inputNewFeature}
                                       placeholder="Enter a new feature request?"
                                />
                                <input type="submit" value="Save" className="button"/>
                            </form>
                        </div>

                        <div className="card">
                            <form onSubmit={this.handleNewEmail}>
                                <input type="text" className="noborder" ref={this.inputEmail}
                                       placeholder="Enter your email to be notified on released items?"
                                />
                                <input type="submit" value="Save" className="button"/>
                            </form>
                        </div>
                    </div>
                </main>

                <footer>
                    <a
                        href="https://vercel.com/integrations/upstash"
                        target="_blank"
                        rel="noopener noreferrer">
                        Powered by
                        <img src="/vercel.svg" alt="Vercel Logo" />
                        and
                        <img src="/upstash.png" alt="Upstash Logo" />
                    </a>
                </footer>
                <ToastContainer />
            </div>
        )
    }
}

export default Home;
