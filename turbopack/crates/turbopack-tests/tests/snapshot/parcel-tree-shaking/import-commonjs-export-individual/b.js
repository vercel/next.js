import { name, version } from './c.js';
function getId() {
    return name + ":"+ version
};
export { name, version, getId };
