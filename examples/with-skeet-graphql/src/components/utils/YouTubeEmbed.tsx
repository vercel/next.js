type Props = {
  embedId: string
}
export default function YouTubeEmbed({ embedId }: Props) {
  return (
    <>
      <div className="relative pb-[56.25%]">
        <iframe
          className="absolute left-0 top-0 h-full w-full"
          src={`https://www.youtube.com/embed/${embedId}`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Embedded YouTube"
        />
      </div>
    </>
  )
}
