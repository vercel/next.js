import { useState, useEffect } from "react";
import { distanceInWordsToNow } from "date-fns";

import Layout, { LayoutRow, LayoutCell } from "./../../components/layout";
import Order from "./../../components/order";
import { useFirebase } from "../../firebase";
import { useAuthState } from "../../session";
import notify from "../notify";
import Empty from "../empty";

const noOp = () => {};

const PrevOrders = () => {
  const [orders, setOrders] = useState([]);
  const [ordered, setOrdered] = useState();
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
      .where("status", "==", "done")
      .orderBy("time_ordered", "desc")
      .limit(5)
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
        message: "Couldn't place order. Please try again.",
        toastId: "prev-order-error",
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
          <LayoutCell key={`prev-order-${i}`}>
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
      header="No Previous Orders found"
      subtext="Lets go order some coffee"
      icon="free_breakfast"
    />
  );
};

export default PrevOrders;
