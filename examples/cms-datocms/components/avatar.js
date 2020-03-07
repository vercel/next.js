export default function Avatar() {
  return (
    <div className="flex items-center">
      <img
        src="/images/author.jpg"
        className="w-12 h-12 rounded-full mr-4 grayscale"
      />
      <div className="text-xl font-bold">Shu Uesugi</div>
    </div>
  )
}
