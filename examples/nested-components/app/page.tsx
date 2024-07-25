import P from "./_components/paragraph";
import Post from "./_components/post";

import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.main}>
      <Post title="My first blog post">
        <P>Hello there</P>
        <P>This is an example of a componentized blog post</P>
      </Post>
      <hr />
      <Post title="My second blog post">
        <P>Hello there</P>
        <P>This is another example.</P>
        <P>Wa-hoo!</P>
      </Post>
      <hr />
      <Post title="The final blog post">
        <P>C’est fin</P>
      </Post>
    </div>
  );
}
