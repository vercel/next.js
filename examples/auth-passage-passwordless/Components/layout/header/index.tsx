import styles from '../../../styles/Banner.module.css'

const Header = () => {

    return (

        <div className={styles.mainHeader}>
            <a href="https://passage.id/" ><div className={styles.passageLogo}></div></a>
            <div className={styles.headerText}>Passage + Next.js/Typescript Example App</div>
            <div className={styles.spacer}></div>
            <a href="https://passage.id/" className={styles.link}>Go to Passage</a>
        </div>

    )
}

export default Header