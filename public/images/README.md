# Slot Machine Game Images

This directory contains image assets for slot machine games in the Next.js application.

## Directory Structure

```
public/images/
└── jungle-adventure/
    ├── symbol1.png  (Banana symbol)
    ├── symbol2.png  (Monkey symbol)
    ├── symbol3.png  (Palm Tree symbol)
    ├── symbol4.png  (Diamond symbol)
    └── symbol5.png  (Lizard symbol)
```

## Usage in Next.js

These images can be referenced in your Next.js components using the `next/image` component:

```jsx
import Image from 'next/image'

export default function SlotSymbol() {
  return (
    <Image
      src="/images/jungle-adventure/symbol1.png"
      alt="Banana slot symbol"
      width={200}
      height={200}
    />
  )
}
```

## Adding New Games

To add images for new slot machine games:

1. Create a new folder under `public/images/{game-name}/`
2. Add your symbol images (PNG format recommended)
3. Follow the naming convention: `symbol1.png`, `symbol2.png`, etc.
4. Update this README with the new game structure

## Image Specifications

- **Format**: PNG with transparency support
- **Dimensions**: 200x200 pixels (can be scaled via Next.js Image component)
- **Style**: 3D realistic slot machine symbols, casino style
- **Colors**: Game-appropriate color schemes

## AI Prompt for Generating New Symbols

Use this prompt with AI image generation tools:

> 3D realistic slot machine symbol for [Game Title], highly detailed, casino style

Replace `[Game Title]` with your specific game theme (e.g., "Jungle Adventure", "Ocean Treasure", "Space Quest").