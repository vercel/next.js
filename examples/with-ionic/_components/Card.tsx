import Image from "next/image";

type CardProps = {
  imageSrc: string;
  title: string;
  subtitle: string;
  content: string;
};

export default function Card({
  imageSrc,
  title,
  subtitle,
  content,
}: CardProps) {
  return (
    <ion-card>
      <Image
        src={imageSrc}
        alt={`Image of ${title}`}
        width={320}
        height={320}
        priority={true}
      />
      <ion-card-header>
        <ion-card-subtitle>{subtitle}</ion-card-subtitle>
        <ion-card-title>{title}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-icon name="pin" slot="start"></ion-icon>
        {content}
      </ion-card-content>
    </ion-card>
  );
}
