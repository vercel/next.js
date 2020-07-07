export default function SelectInput(props) {
  return (
    <div className="max-w-xs inline-block relative">
      <select
        className="w-full h-12 appearance-none border border-black py-2 pl-4 pr-8"
        {...props}
      />
      <div className="absolute pointer-events-none inset-y-0 right-0 flex items-center px-2">
        <svg
          className="fill-current h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
        >
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </div>
    </div>
  )
}
