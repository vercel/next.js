import { SaleorManager } from '@saleor/sdk'

const config = { apiUrl: process.env.SALEOR_URL }
const manager = new SaleorManager(config)

export default manager
