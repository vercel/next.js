import DotCmsImage from "./dotcms-image";

export default function Avatar({ name, picture }) {
  return (
    <div className="flex items-center ">
      <div className="w-12 h-12 relative mr-4">
        {picture?.idPath ? (
          <DotCmsImage
            src={picture?.idPath}
            layout="fill"
            className="rounded-full"
            alt={name}
          />
        ) : null}
      </div>
      <div className="text-xl font-bold">{name}</div>
    </div>
  );
}
