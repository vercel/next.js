import Image, { ImageProps } from "next/image";
import ViewSource from "../../components/view-source";
import styles from "../../styles.module.css";

// Note: we cannot use `priority` or `loading="eager"
// because we depend on the default `loading="lazy"`
// behavior to wait for CSS to reveal the proper image.
type Props = Omit<ImageProps, "src" | "priority" | "loading"> & {
  srcLight: string;
  srcDark: string;
};

const ThemeImage = (props: Props) => {
  const { srcLight, srcDark, ...rest } = props;

  return (
    <>
      <Image {...rest} src={srcLight} className={styles.imgLight} />
      <Image {...rest} src={srcDark} className={styles.imgDark} />
    </>
  );
};

const Page = () => (
  <div>
    <ViewSource pathname="app/theme/page.tsx" />
    <h1>Image With Light/Dark Theme Detection</h1>
    <ThemeImage
      alt="Next.js Streaming"
      srcLight="https://assets.vercel.com/image/upload/front/nextjs/streaming-light.png"
      srcDark="https://assets.vercel.com/image/upload/front/nextjs/streaming-dark.png"
      width={588}
      height={387}
    />
  </div>
);

export default Page;
