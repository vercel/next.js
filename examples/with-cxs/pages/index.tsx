import cxs from "cxs";

const cx = {
  root: cxs({
    width: 80,
    height: 60,
    background: "white",
    ":hover": {
      background: "black",
    },
  }),

  title: cxs({
    marginLeft: 5,
    color: "black",
    fontSize: 22,
    ":hover": {
      color: "white",
    },
  }),
};

export default function Home() {
  return (
    <div className={cx.root}>
      <h1 className={cx.title}>My page</h1>
    </div>
  );
}
