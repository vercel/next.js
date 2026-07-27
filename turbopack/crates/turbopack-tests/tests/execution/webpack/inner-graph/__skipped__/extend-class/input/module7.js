import { K } from './dep2'

class BaseK extends K {}
class BaseBaseK extends BaseK {}

export default new BaseBaseK()
