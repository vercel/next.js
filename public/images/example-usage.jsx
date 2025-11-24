// Example usage of slot machine images in a Next.js component
import Image from 'next/image'

export default function JungleSlotMachine() {
  const symbols = [
    { src: '/images/jungle-adventure/symbol1.png', alt: 'Banana symbol' },
    { src: '/images/jungle-adventure/symbol2.png', alt: 'Monkey symbol' },
    { src: '/images/jungle-adventure/symbol3.png', alt: 'Palm Tree symbol' },
    { src: '/images/jungle-adventure/symbol4.png', alt: 'Diamond symbol' },
    { src: '/images/jungle-adventure/symbol5.png', alt: 'Lizard symbol' },
  ]

  return (
    <div className="slot-machine">
      <h1>Jungle Adventure Slot Machine</h1>
      <div className="symbols-grid">
        {symbols.map((symbol, index) => (
          <div key={index} className="symbol-container">
            <Image
              src={symbol.src}
              alt={symbol.alt}
              width={200}
              height={200}
              priority={index < 3} // Prioritize loading first 3 symbols
            />
          </div>
        ))}
      </div>
      
      <style jsx>{`
        .slot-machine {
          text-align: center;
          padding: 2rem;
        }
        .symbols-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          max-width: 1000px;
          margin: 0 auto;
        }
        .symbol-container {
          display: flex;
          justify-content: center;
          align-items: center;
        }
      `}</style>
    </div>
  )
}