import ContentZone from "./content-zone";

export default function OneColumnTemplate(props) {
  return (
    <>
      <ContentZone name="MainContentZone" {...props} />
    </>
  );
}
