import { toast, Zoom } from "react-toastify";
import Snack from "./../components/snack";

const notify = ({ message, toastId, action, onActionClick }) => {
  toast(
    ({ closeToast }) => (
      <Snack
        message={message}
        action={action}
        onActionClick={() => {
          closeToast();
          onActionClick();
        }}
        transition={Zoom}
        closeToast={closeToast}
      />
    ),
    {
      toastId
    }
  );
};

export default notify;
