import { FunctionComponent } from "react";

type Props = {
  message: string;
};

const ErrorMessage: FunctionComponent<Props> = ({ message }) => (
  <aside>
    {message}
    <style jsx>{`
      aside {
        padding: 1.5em;
        font-size: 14px;
        color: white;
        background-color: red;
      }
    `}</style>
  </aside>
);

export default ErrorMessage;
