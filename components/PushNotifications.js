import { useEffect } from 'react';

const PushNotifications = () => {
  useEffect(() => {
    // Check if Push Notifications are supported
    if (!("Notification" in window)) {
      console.log("This browser does not support desktop notification");
    } else if (Notification.permission === "granted") {
      // If it's okay let's create a notification
      const notification = new Notification("New content is available!", {
        body: "Click to view the latest updates.",
        icon: "/icons/notification-icon.png",
      });
      notification.onclick = () => {
        window.open(window.location.href);
      };
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        // If the user accepts, let's create a notification
        if (permission === "granted") {
          const notification = new Notification("Welcome to our website!", {
            body: "Stay tuned for updates.",
            icon: "/icons/notification-icon.png",
          });
          notification.onclick = () => {
            window.open(window.location.href);
          };
        }
      });
    }
  }, []);

  return null;
};

export default PushNotifications;
