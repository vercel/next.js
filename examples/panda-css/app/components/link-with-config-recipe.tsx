import { link } from '@/styled-system/recipes'

/**
 * Link with config recipe
 * @see https://panda-css.com/docs/concepts/recipes#config-recipe
 */
export default function LinkWithConfigRecipe() {
  return (
    <a
      className={link()}
      href="https://panda-css.com/docs/concepts/recipes#config-recipe"
      target="_blank"
      rel="noreferrer"
    >
      Link with <b>config recipe</b>
      <span className="icon">-&gt;</span>
    </a>
  )
}
