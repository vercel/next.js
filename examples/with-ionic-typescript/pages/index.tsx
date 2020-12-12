import Image from 'next/image'

export default function Home() {
  return (
    <ion-grid>
      <ion-row>
        {new Array(8).fill('').map((k, i) => (
          <ion-col key={i} size="3">
            <ion-card>
              <Image
                src="/cat.jpg"
                alt="Picture of the author"
                width={500}
                height={500}
              />
              <ion-card-header>
                <ion-card-subtitle>Destination</ion-card-subtitle>
                <ion-card-title>Madison, WI</ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <ion-icon name="pin" slot="start"></ion-icon>
                Keep close to Nature's heart... and break clear away, once in
                awhile, and climb a mountain or spend a week in the woods. Wash
                your spirit clean.
              </ion-card-content>
            </ion-card>
          </ion-col>
        ))}
      </ion-row>
    </ion-grid>
  )
}
