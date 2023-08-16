export const Callout = ({ emoji = null, text }) => (
  <div className="bg-gray-200 dark:bg-[#333] dark:text-gray-300 flex items-start p-3 my-6 text-base">
    <span className="block w-6 text-center text-xl mr-2">{emoji}</span>
    <span className="block grow">{text}</span>
  </div>
)
