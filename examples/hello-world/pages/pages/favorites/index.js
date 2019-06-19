import { useState, useEffect } from "react";
import { distanceInWordsToNow } from "date-fns";

import Layout, { LayoutRow, LayoutCell } from "./../../components/layout";
import Order from "./../../components/order";
import { useFirebase } from "../../firebase";
import { useAuthState } from "../../session";
import notify from "./../notify";
import Empty from "../empty";

const noOp = () => {};

const Favorites = () => {
  const [orders, setOrders] = useState([]);
  const [ordered, setOrdered] = useState(false);
  const { firebaseDB, firebaseApp } = useFirebase();
  const { authUser } = useAuthState();

  useEffect(() => {
    const unsub = listener();
    return unsub;
  }, []);

  const listener = () =>
    firebaseDB
      .collection("orders")
      .where(
        "user",
        "==",
        firebaseDB.collection("users").doc(`${authUser.uid}`)
      )
      .where("fav", "==", true)
      .orderBy("time_ordered", "desc")
      .onSnapshot(querySnapshot => {
        const formattedOrders = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            time_ordered: data.time_ordered.toDate()
          };
        });
        setOrders(formattedOrders);
      });

  const onOrder = index => async ({ options }) => {
    try {
      await firebaseDB.collection("orders").add({
        name: authUser.displayName,
        status: "ordered",
        options,
        user: firebaseDB.collection("users").doc(`${authUser.uid}`),
        time_ordered: firebaseApp.firestore.Timestamp.fromDate(new Date()),
        fav: false
      });
      setOrdered(index);
    } catch (e) {
      notify({
        message: "Couldn't place a favorite order. Please try again.",
        toastId: "fav-order-error",
        action: "Retry",
        onActionClick: () => {
          onOrder({ options });
        }
      });
      console.log(e);
    }
  };

  return orders.length ? (
    <Layout>
      <LayoutRow>
        {orders.map(({ time_ordered, ...rest }, i) => (
          <LayoutCell key={i}>
            <Order
              order={rest}
              bodyString={distanceInWordsToNow(new Date(time_ordered), {
                includeSeconds: true
              })}
              action={ordered === i ? "Done!" : "Order"}
              extraOnClick={ordered === i ? noOp : onOrder(i)}
            />
          </LayoutCell>
        ))}
      </LayoutRow>
    </Layout>
  ) : (
    <Empty
      header="Your favorites sure do look empty"
      subtext="Why not order something and click that heart icon?"
      icon="favorite_outline"
    />
  );
};

export default Favorites;
