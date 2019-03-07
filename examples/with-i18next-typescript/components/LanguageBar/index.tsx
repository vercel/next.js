import React from 'react';
import {i18n} from '../../i18n'

const LanguageBar = () => {
    return (
        <div className='tabs is-small is-centered language-bar'>
            <ul>
                <li>
                    <a onClick={() => i18n.changeLanguage('en')}>
                        EN
                    </a>
                </li>
                <li>
                    <a onClick={() => i18n.changeLanguage('de')}>
                        DE
                    </a>
                </li>
                <li>
                    <a onClick={() => i18n.changeLanguage('hi')}>
                        HI
                    </a>
                </li>
                <li>
                    <a onClick={() => i18n.changeLanguage('ja')}>
                        JA
                    </a>
                </li>
            </ul>
        </div>
    );
};

export default LanguageBar;
