
/* Without CSS Modules, maybe with PostCSS */

import '../style.css'

export default () => <div className='example'>O Hai world!</div>

/* With CSS Modules */
/*
import css from "../style.css"

export default () => <div className={css.example}>Hello World, I am being styled using CSS Modules!</div>
*/
