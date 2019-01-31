import App, {Container} from 'next/app'
import Head from 'next/head'
import firebase from 'firebase/app'
import clientCredentials from '../credentials/client'
import AuthProvider, { AuthContext } from '../env/auth-context';

class MyApp extends App{
    static async getInitialProps({ctx: {req}}) {
        const user = req && req.session ? req.session.decodedToken : null
        return { user }
    }

    constructor() {
        super()
        // firebase is stateful so we have to prevent reinitialization
        if (!firebase.apps.length)
            firebase.initializeApp(clientCredentials)
    }

    render() {
        const {Component, user} = this.props;
        return (
            <Container>
                <Head>
                    <title>Firebase auth example</title>
                </Head>
                <AuthProvider initialState={{user}}>
                    {/*
                    The user is now passed to every single page.
                    This is probably not what you want in a production app:
                    Try to place the consumer as close as possible to where you need it.
                     */}
                    <AuthContext.Consumer>
                        {({user}) => (
                            <Component user={user}/>
                        )}
                    </AuthContext.Consumer>
                </AuthProvider>
            </Container>
        )
    }
}

export default MyApp;