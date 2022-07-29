import styleLoader from "../styles/Loader.module.css";

const Loader = () => {
  return (
    <div className={styleLoader.spinnerContainer}>
      <div className={styleLoader.spinner}></div>
    </div>
  );
};

export default Loader;
