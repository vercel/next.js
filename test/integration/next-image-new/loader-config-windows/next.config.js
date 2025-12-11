module.exports = {
  images: {
    loader: 'custom',
    // Використовуємо відносний шлях, який Next.js перетворить на абсолютний
    // На Windows абсолютний шлях міститиме backslashes, які потім нормалізуються
    loaderFile: './dummy-loader.js',
  },
}
