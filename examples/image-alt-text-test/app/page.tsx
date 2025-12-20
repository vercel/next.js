import Image from "next/image";

const images = [
  {
    src: "https://picsum.photos/seed/beautiful-sunset-landscape/400/300",
    width: 400,
    height: 300,
  },
  {
    src: "https://picsum.photos/seed/user-profile-avatar/300/200",
    width: 300,
    height: 200,
  },
  {
    src: "https://picsum.photos/seed/company-logo-branding/300/200",
    width: 300,
    height: 200,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-8">Image Alt Text Test</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Beispiele ohne alt-Prop</h2>
          <p className="text-sm text-gray-600">
            Alle Bilder unten haben kein alt-Attribut. Die Alt-Texte sollten
            automatisch aus dem Dateinamen (seed) generiert werden.
          </p>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold">Bilder</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {images.map((img) => (
              <div key={img.src} className="border rounded-lg p-4">
                <Image
                  src={img.src}
                  width={img.width}
                  height={img.height}
                  className="w-full h-auto rounded"
                />
                <p className="text-sm text-gray-600 mt-2 break-all">
                  {img.src}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold mb-2">Test-Anweisungen:</h3>
        <ul className="text-sm space-y-1">
          <li>
            • In Dev-Tools prüfen, ob die alt-Attribute automatisch gefüllt
            werden
          </li>
          <li>• Kein alt-Prop gesetzt → automatische Generierung</li>
          <li>
            • Der Seed (z. B. “beautiful-sunset-landscape”) sollte zum Alt-Text
            werden
          </li>
          <li>• URLs austauschbar; nur Dateiname/Seed ist relevant</li>
        </ul>
      </div>
    </main>
  );
}
