/* With CSS Modules */
import css from "../style.css"

export default () => (
    <div className={css.example}>
        <p className={css.exampleDescription}>Hello World, I am being styled using <strong>Typed</strong> CSS Modules!</p>
    </div>
)
