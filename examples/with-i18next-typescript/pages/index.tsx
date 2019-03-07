import React, {Fragment} from 'react';
import './styles.sass'
import {withNamespaces, namespacesRequired} from "../i18n";
import LanguageBar from "../components/LanguageBar";

const HomePage: React.FunctionComponent = ({t}) => {
    return (
        <Fragment>
            <LanguageBar/>
            <section className="hero is-large">
                <div className="hero-body has-text-centered">
                    <h1 className="title">
                        {t("hello-world")}
                    </h1>
                </div>
            </section>
        </Fragment>
    )
};

HomePage.getInitialProps = () => {
    return {
        namespacesRequired: ['common'],
    }
}

export default withNamespaces('common')(HomePage);
