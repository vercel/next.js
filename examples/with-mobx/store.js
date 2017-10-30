/* global clearInterval setInterval */

// modules
import { action, observable }         from 'mobx';
import { inject, observer, Provider } from 'mobx-react';
import React                          from 'react';


let stores = null;

class Store {
    @observable lastUpdate = null;
    @observable light = null;

    constructor () {
        this.lastUpdate = Date.now();
        this.light = false;
    }

    @action start = () => {
        this.timer = setInterval(() => {
            this.lastUpdate = Date.now();
            this.light = true;
        }, 1000);
    };

    stop = () => clearInterval(this.timer);
}

export function initStore(isServer, name) {
    if (isServer) {
        return new Store();
    } else {
        if (stores === null) {
            stores = {};
        }
        if (!stores.hasOwnProperty(name)) {
            stores[name] = new Store();
        }
        return stores[name];
    }
}

export function withMobX(...args) {
    const storeNames = [],
          initStoreFns = [];

    while (args.length) {
        const name = args.shift(),
              initStore = args.shift();
        storeNames.push(name);
        initStoreFns.push(initStore);
    }

    return function (Page) {
        function _Page(props) {
            const isServer = props.isServer,
                  _stores = storeNames.reduce((_stores, name, index) => {
                      _stores[name] = initStoreFns[index](isServer, name);
                      return _stores;
                  }, {}),
                  _props = Object.keys(props).reduce((_props, key) => {
                      _props[key] = props[key];
                      return _props;
                  }, {});
            return React.createElement(
                Provider,
                _stores,
                React.createElement(
                    inject(...storeNames)(observer(Page)),
                    _props
                )
            );
        }

        _Page.getInitialProps = async function (ctx) {
            const isServer = !!ctx.req;
            ctx.isServer = isServer;
            storeNames.forEach((name, index) => {
                if (!ctx.hasOwnProperty(name)) {
                    ctx[name] = initStoreFns[index](isServer, name);
                }
            });
            let _props = null;
            if (typeof Page.getInitialProps === 'function') {
                _props = await Page.getInitialProps(ctx);
            }
            const props = { isServer };
            if (_props) {
                Object.keys(_props).forEach((key) => {
                    props[key] = _props[key];
                });
            }
            return props;
        };

        return _Page;
    };
};
