import App, { Container } from "next/app";
import React from "react";

import Firebase, { FirebaseContext } from "./firebase";
import { AuthUserContext } from "./session";
import { CoffeeHourContext } from "./coffee-hour";
import { AdminContext } from "./admin";

const FirebaseApp = Firebase();

export default class CoffeeApp extends App {
  state = { authUser: FirebaseApp.firebaseAuth.currentUser, loading: false };
  listener = null;
  coffeeHourListener = null;

  static async getInitialProps({ Component, ctx }) {
    let pageProps = {};

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx);
    }

    return { pageProps };
  }

  async componentDidMount() {
    this.setState(prevState => ({ ...prevState, loading: true }));
    this.listener = FirebaseApp.firebaseAuth.onAuthStateChanged(user => {
      this.setState(prevState => ({
        ...prevState,
        authUser: user
      }));
    });
    this.coffeeHourListener = FirebaseApp.firebaseDB
      .collection("settings")
      .doc("admin")
      .onSnapshot(doc => {
        const { is_bar_active } = doc.data();
        this.setState(prevState => ({
          ...prevState,
          coffeeHour: is_bar_active
        }));
      });
    const doc = await FirebaseApp.firebaseDB
      .collection("settings")
      .doc("admin")
      .get();
    const { current_admin } = doc.data();
    this.setState(prevState => ({
      ...prevState,
      admin: current_admin.some(admin => admin === this.state.authUser.email),
      loading: false
    }));
  }

  componentWillUnmount() {
    this.listener && this.listener();
    this.coffeeHourListener && this.coffeeHourListener();
  }

  render() {
    const { Component, pageProps } = this.props;
    const { coffeeHour, admin, ...rest } = this.state;
    return (
      <FirebaseContext.Provider value={FirebaseApp}>
        <AuthUserContext.Provider value={rest}>
          <CoffeeHourContext.Provider value={coffeeHour}>
            <AdminContext.Provider value={admin}>
              <Container>
                <Component {...pageProps} />
              </Container>
            </AdminContext.Provider>
          </CoffeeHourContext.Provider>
        </AuthUserContext.Provider>
      </FirebaseContext.Provider>
    );
  }
}
