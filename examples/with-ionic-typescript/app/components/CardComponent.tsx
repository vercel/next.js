// components/CardComponent.tsx
import Image from "next/image";

interface CardComponentProps {
    imageSrc: string;
    title: string;
    subtitle: string;
    content: string;
}

const CardComponent = ({ imageSrc, title, subtitle, content }: CardComponentProps) => {
    return (
        <ion-card>
            <Image src={imageSrc} alt={`Image of ${title}`} width={500} height={500} />
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
};

export default CardComponent;
