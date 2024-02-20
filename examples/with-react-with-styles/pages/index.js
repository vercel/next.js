import { css, withStyles } from "react-with-styles";

function Home({ styles }) {
  return (
    <div>
      <h1 {...css(styles.title)}>My page</h1>
    </div>
  );
}

export default withStyles(({ color }) => ({
  title: {
    color: color.primary,
  },
}))(Home);
