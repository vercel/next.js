// app/page.tsx
import Player from "./_components/Player";
import PlayerCSS from "./_components/PlayerCss";

export default function Home() {
  const videoJsOptions = {
    techOrder: ["youtube"],
    autoplay: false,
    controls: true,
    sources: [
      {
        src: "https://www.youtube.com/watch?v=IxQB14xVas0",
        type: "video/youtube",
      },
    ],
  };

  return (
    <>
      <Player {...videoJsOptions} />
      <PlayerCSS />
    </>
  );
}
