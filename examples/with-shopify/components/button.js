import cn from 'classnames'

export default function Button({ className, secondary, ...props }) {
  return (
    <button
      className={cn(
        className,
        'font-medium py-2 px-4 duration-200 transition-colors border',
        {
          'bg-black hover:bg-white text-white hover:text-black border-black': !secondary,
          'bg-accent-2 hover:bg-white border-accent-2': secondary,
        }
      )}
      {...props}
    />
  )
}
