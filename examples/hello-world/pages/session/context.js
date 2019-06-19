import { createContext, useState, useEffect, useContext } from "react";

const AuthUserContext = createContext(null);

export const useAuthUser = firebaseAuth => {
  const [authUser, setAuthUser] = useState();

  useEffect(() => {
    if (firebaseAuth.currentUser) {
      setAuthUser(firebaseAuth.currentUser);
    }
    const authListener = firebaseAuth.onAuthStateChanged(user => {
      setAuthUser(user);
    });
    return authListener;
  }, [firebaseAuth]);

  return authUser;
};

export const useAuthState = () => useContext(AuthUserContext);

export default AuthUserContext;
