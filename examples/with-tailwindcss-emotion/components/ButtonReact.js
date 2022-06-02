/* Example with @emotion/react */
import xw, { cx } from 'xwind'

//"react native style"
const styles = {
  button: xw`
    relative
    w-64 min-w-full
    flex justify-center
    py-2 px-4
    border border-transparent
    text-sm leading-5 font-medium
    rounded-md
    text-white
    bg-gray-600
    hover:bg-gray-500
    focus[outline-none ring-4 ring-gray-400]
    active:bg-gray-700
    transition duration-150 ease-in-out
  `,
}

const ButtonReact = ({ className, children, ...props }) => (
  <button {...props} css={styles.button} className={cx('group', className)}>
    {/* inline style*/}
    <span css={xw`absolute left-0 inset-y-0 flex items-center pl-3`}>
      <svg
        css={xw`h-5 w-5 text-gray-500 group-hover:text-gray-400 transition ease-in-out duration-150`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
          clipRule="evenodd"
        />
      </svg>
    </span>
    {children}
  </button>
)

export default ButtonReact
