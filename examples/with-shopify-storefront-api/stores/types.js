const Checkout = {
  "name": "Checkout",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "appliedGiftCards": "AppliedGiftCard",
    "availableShippingRates": "AvailableShippingRates",
    "completedAt": "DateTime",
    "createdAt": "DateTime",
    "currencyCode": "CurrencyCode",
    "customAttributes": "Attribute",
    "customer": "Customer",
    "email": "String",
    "id": "ID",
    "lineItems": "CheckoutLineItemConnection",
    "note": "String",
    "order": "Order",
    "orderStatusUrl": "URL",
    "paymentDue": "Money",
    "ready": "Boolean",
    "requiresShipping": "Boolean",
    "shippingAddress": "MailingAddress",
    "shippingLine": "ShippingRate",
    "subtotalPrice": "Money",
    "taxExempt": "Boolean",
    "taxesIncluded": "Boolean",
    "totalPrice": "Money",
    "totalTax": "Money",
    "updatedAt": "DateTime",
    "webUrl": "URL"
  },
  "implementsNode": true
};
Object.freeze(Checkout.fieldBaseTypes);
var Checkout$1 = Object.freeze(Checkout);

const ID = {
  "name": "ID",
  "kind": "SCALAR"
};
var ID$1 = Object.freeze(ID);

const Boolean = {
  "name": "Boolean",
  "kind": "SCALAR"
};
var Boolean$1 = Object.freeze(Boolean);

const CheckoutLineItemConnection = {
  "name": "CheckoutLineItemConnection",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "edges": "CheckoutLineItemEdge",
    "pageInfo": "PageInfo"
  },
  "implementsNode": false
};
Object.freeze(CheckoutLineItemConnection.fieldBaseTypes);
var CheckoutLineItemConnection$1 = Object.freeze(CheckoutLineItemConnection);

const PageInfo = {
  "name": "PageInfo",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "hasNextPage": "Boolean",
    "hasPreviousPage": "Boolean"
  },
  "implementsNode": false
};
Object.freeze(PageInfo.fieldBaseTypes);
var PageInfo$1 = Object.freeze(PageInfo);

const CheckoutLineItemEdge = {
  "name": "CheckoutLineItemEdge",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "cursor": "String",
    "node": "CheckoutLineItem"
  },
  "implementsNode": false
};
Object.freeze(CheckoutLineItemEdge.fieldBaseTypes);
var CheckoutLineItemEdge$1 = Object.freeze(CheckoutLineItemEdge);

const String = {
  "name": "String",
  "kind": "SCALAR"
};
var String$1 = Object.freeze(String);

const CheckoutLineItem = {
  "name": "CheckoutLineItem",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "customAttributes": "Attribute",
    "id": "ID",
    "quantity": "Int",
    "title": "String",
    "variant": "ProductVariant"
  },
  "implementsNode": true
};
Object.freeze(CheckoutLineItem.fieldBaseTypes);
var CheckoutLineItem$1 = Object.freeze(CheckoutLineItem);

const ProductVariant = {
  "name": "ProductVariant",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "available": "Boolean",
    "id": "ID",
    "image": "Image",
    "price": "Money",
    "product": "Product",
    "selectedOptions": "SelectedOption",
    "title": "String",
    "weight": "Float",
    "weightUnit": "WeightUnit"
  },
  "implementsNode": true
};
Object.freeze(ProductVariant.fieldBaseTypes);
var ProductVariant$1 = Object.freeze(ProductVariant);

const Float = {
  "name": "Float",
  "kind": "SCALAR"
};
var Float$1 = Object.freeze(Float);

const WeightUnit = {
  "name": "WeightUnit",
  "kind": "ENUM"
};
var WeightUnit$1 = Object.freeze(WeightUnit);

const Money = {
  "name": "Money",
  "kind": "SCALAR"
};
var Money$1 = Object.freeze(Money);

const Image = {
  "name": "Image",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "altText": "String",
    "id": "ID",
    "src": "URL"
  },
  "implementsNode": false
};
Object.freeze(Image.fieldBaseTypes);
var Image$1 = Object.freeze(Image);

const URL = {
  "name": "URL",
  "kind": "SCALAR"
};
var URL$1 = Object.freeze(URL);

const Int = {
  "name": "Int",
  "kind": "SCALAR"
};
var Int$1 = Object.freeze(Int);

const CropRegion = {
  "name": "CropRegion",
  "kind": "ENUM"
};
var CropRegion$1 = Object.freeze(CropRegion);

const SelectedOption = {
  "name": "SelectedOption",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "name": "String",
    "value": "String"
  },
  "implementsNode": false
};
Object.freeze(SelectedOption.fieldBaseTypes);
var SelectedOption$1 = Object.freeze(SelectedOption);

const Product = {
  "name": "Product",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "collections": "CollectionConnection",
    "createdAt": "DateTime",
    "description": "String",
    "descriptionHtml": "HTML",
    "descriptionPlainSummary": "String",
    "handle": "String",
    "id": "ID",
    "images": "ImageConnection",
    "options": "ProductOption",
    "productType": "String",
    "publishedAt": "DateTime",
    "tags": "String",
    "title": "String",
    "updatedAt": "DateTime",
    "variants": "ProductVariantConnection",
    "vendor": "String"
  },
  "implementsNode": true
};
Object.freeze(Product.fieldBaseTypes);
var Product$1 = Object.freeze(Product);

const CollectionConnection = {
  "name": "CollectionConnection",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "edges": "CollectionEdge",
    "pageInfo": "PageInfo"
  },
  "implementsNode": false
};
Object.freeze(CollectionConnection.fieldBaseTypes);
var CollectionConnection$1 = Object.freeze(CollectionConnection);

const CollectionEdge = {
  "name": "CollectionEdge",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "cursor": "String",
    "node": "Collection"
  },
  "implementsNode": false
};
Object.freeze(CollectionEdge.fieldBaseTypes);
var CollectionEdge$1 = Object.freeze(CollectionEdge);

const Collection = {
  "name": "Collection",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "description": "String",
    "descriptionHtml": "HTML",
    "descriptionPlainSummary": "String",
    "handle": "String",
    "id": "ID",
    "image": "Image",
    "products": "ProductConnection",
    "title": "String",
    "updatedAt": "DateTime"
  },
  "implementsNode": true
};
Object.freeze(Collection.fieldBaseTypes);
var Collection$1 = Object.freeze(Collection);

const HTML = {
  "name": "HTML",
  "kind": "SCALAR"
};
var HTML$1 = Object.freeze(HTML);

const DateTime = {
  "name": "DateTime",
  "kind": "SCALAR"
};
var DateTime$1 = Object.freeze(DateTime);

const ProductConnection = {
  "name": "ProductConnection",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "edges": "ProductEdge",
    "pageInfo": "PageInfo"
  },
  "implementsNode": false
};
Object.freeze(ProductConnection.fieldBaseTypes);
var ProductConnection$1 = Object.freeze(ProductConnection);

const ProductEdge = {
  "name": "ProductEdge",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "cursor": "String",
    "node": "Product"
  },
  "implementsNode": false
};
Object.freeze(ProductEdge.fieldBaseTypes);
var ProductEdge$1 = Object.freeze(ProductEdge);

const Node = {
  "name": "Node",
  "kind": "INTERFACE",
  "fieldBaseTypes": {
    "id": "ID"
  },
  "possibleTypes": ["AppliedGiftCard", "Checkout", "CheckoutLineItem", "Collection", "MailingAddress", "Order", "Payment", "Product", "ProductOption", "ProductVariant", "ShopPolicy"]
};
Object.freeze(Node.fieldBaseTypes);
Object.freeze(Node.possibleTypes);
var Node$1 = Object.freeze(Node);

const ImageConnection = {
  "name": "ImageConnection",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "edges": "ImageEdge",
    "pageInfo": "PageInfo"
  },
  "implementsNode": false
};
Object.freeze(ImageConnection.fieldBaseTypes);
var ImageConnection$1 = Object.freeze(ImageConnection);

const ImageEdge = {
  "name": "ImageEdge",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "cursor": "String",
    "node": "Image"
  },
  "implementsNode": false
};
Object.freeze(ImageEdge.fieldBaseTypes);
var ImageEdge$1 = Object.freeze(ImageEdge);

const ProductOption = {
  "name": "ProductOption",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "id": "ID",
    "name": "String",
    "values": "String"
  },
  "implementsNode": true
};
Object.freeze(ProductOption.fieldBaseTypes);
var ProductOption$1 = Object.freeze(ProductOption);

const ProductVariantConnection = {
  "name": "ProductVariantConnection",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "edges": "ProductVariantEdge",
    "pageInfo": "PageInfo"
  },
  "implementsNode": false
};
Object.freeze(ProductVariantConnection.fieldBaseTypes);
var ProductVariantConnection$1 = Object.freeze(ProductVariantConnection);

const ProductVariantEdge = {
  "name": "ProductVariantEdge",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "cursor": "String",
    "node": "ProductVariant"
  },
  "implementsNode": false
};
Object.freeze(ProductVariantEdge.fieldBaseTypes);
var ProductVariantEdge$1 = Object.freeze(ProductVariantEdge);

const Attribute = {
  "name": "Attribute",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "key": "String",
    "value": "String"
  },
  "implementsNode": false
};
Object.freeze(Attribute.fieldBaseTypes);
var Attribute$1 = Object.freeze(Attribute);

const MailingAddress = {
  "name": "MailingAddress",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "address1": "String",
    "address2": "String",
    "city": "String",
    "company": "String",
    "country": "String",
    "countryCode": "String",
    "firstName": "String",
    "formatted": "String",
    "id": "ID",
    "lastName": "String",
    "latitude": "Float",
    "longitude": "Float",
    "name": "String",
    "phone": "String",
    "province": "String",
    "provinceCode": "String",
    "zip": "String"
  },
  "implementsNode": true
};
Object.freeze(MailingAddress.fieldBaseTypes);
var MailingAddress$1 = Object.freeze(MailingAddress);

const ShippingRate = {
  "name": "ShippingRate",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "handle": "String",
    "price": "Money",
    "title": "String"
  },
  "implementsNode": false
};
Object.freeze(ShippingRate.fieldBaseTypes);
var ShippingRate$1 = Object.freeze(ShippingRate);

const AvailableShippingRates = {
  "name": "AvailableShippingRates",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "ready": "Boolean",
    "shippingRates": "ShippingRate"
  },
  "implementsNode": false
};
Object.freeze(AvailableShippingRates.fieldBaseTypes);
var AvailableShippingRates$1 = Object.freeze(AvailableShippingRates);

const Customer = {
  "name": "Customer",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "acceptsMarketing": "Boolean",
    "addresses": "MailingAddressConnection",
    "createdAt": "DateTime",
    "defaultAddress": "MailingAddress",
    "displayName": "String",
    "email": "String",
    "firstName": "String",
    "id": "ID",
    "lastName": "String",
    "orders": "OrderConnection",
    "phone": "String",
    "updatedAt": "DateTime"
  },
  "implementsNode": false
};
Object.freeze(Customer.fieldBaseTypes);
var Customer$1 = Object.freeze(Customer);

const MailingAddressConnection = {
  "name": "MailingAddressConnection",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "edges": "MailingAddressEdge",
    "pageInfo": "PageInfo"
  },
  "implementsNode": false
};
Object.freeze(MailingAddressConnection.fieldBaseTypes);
var MailingAddressConnection$1 = Object.freeze(MailingAddressConnection);

const MailingAddressEdge = {
  "name": "MailingAddressEdge",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "cursor": "String",
    "node": "MailingAddress"
  },
  "implementsNode": false
};
Object.freeze(MailingAddressEdge.fieldBaseTypes);
var MailingAddressEdge$1 = Object.freeze(MailingAddressEdge);

const OrderConnection = {
  "name": "OrderConnection",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "edges": "OrderEdge",
    "pageInfo": "PageInfo"
  },
  "implementsNode": false
};
Object.freeze(OrderConnection.fieldBaseTypes);
var OrderConnection$1 = Object.freeze(OrderConnection);

const OrderEdge = {
  "name": "OrderEdge",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "cursor": "String",
    "node": "Order"
  },
  "implementsNode": false
};
Object.freeze(OrderEdge.fieldBaseTypes);
var OrderEdge$1 = Object.freeze(OrderEdge);

const Order = {
  "name": "Order",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "cancelReason": "OrderCancelReason",
    "cancelledAt": "DateTime",
    "createdAt": "DateTime",
    "currencyCode": "CurrencyCode",
    "customerUrl": "URL",
    "displayFinancialStatus": "OrderDisplayFinancialStatus",
    "displayFulfillmentStatus": "OrderDisplayFulfillmentStatus",
    "id": "ID",
    "lineItems": "OrderLineItemConnection",
    "orderNumber": "Int",
    "processedAt": "DateTime",
    "shippingAddress": "MailingAddress",
    "subtotalPrice": "Money",
    "totalPrice": "Money",
    "totalRefunded": "Money",
    "totalShippingPrice": "Money",
    "totalTax": "Money",
    "updatedAt": "DateTime"
  },
  "implementsNode": true
};
Object.freeze(Order.fieldBaseTypes);
var Order$1 = Object.freeze(Order);

const OrderCancelReason = {
  "name": "OrderCancelReason",
  "kind": "ENUM"
};
var OrderCancelReason$1 = Object.freeze(OrderCancelReason);

const CurrencyCode = {
  "name": "CurrencyCode",
  "kind": "ENUM"
};
var CurrencyCode$1 = Object.freeze(CurrencyCode);

const OrderDisplayFulfillmentStatus = {
  "name": "OrderDisplayFulfillmentStatus",
  "kind": "ENUM"
};
var OrderDisplayFulfillmentStatus$1 = Object.freeze(OrderDisplayFulfillmentStatus);

const OrderDisplayFinancialStatus = {
  "name": "OrderDisplayFinancialStatus",
  "kind": "ENUM"
};
var OrderDisplayFinancialStatus$1 = Object.freeze(OrderDisplayFinancialStatus);

const OrderLineItemConnection = {
  "name": "OrderLineItemConnection",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "edges": "OrderLineItemEdge",
    "pageInfo": "PageInfo"
  },
  "implementsNode": false
};
Object.freeze(OrderLineItemConnection.fieldBaseTypes);
var OrderLineItemConnection$1 = Object.freeze(OrderLineItemConnection);

const OrderLineItemEdge = {
  "name": "OrderLineItemEdge",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "cursor": "String",
    "node": "OrderLineItem"
  },
  "implementsNode": false
};
Object.freeze(OrderLineItemEdge.fieldBaseTypes);
var OrderLineItemEdge$1 = Object.freeze(OrderLineItemEdge);

const OrderLineItem = {
  "name": "OrderLineItem",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "customAttributes": "Attribute",
    "quantity": "Int",
    "title": "String",
    "variant": "ProductVariant"
  },
  "implementsNode": false
};
Object.freeze(OrderLineItem.fieldBaseTypes);
var OrderLineItem$1 = Object.freeze(OrderLineItem);

const OrderSortKeys = {
  "name": "OrderSortKeys",
  "kind": "ENUM"
};
var OrderSortKeys$1 = Object.freeze(OrderSortKeys);

const AppliedGiftCard = {
  "name": "AppliedGiftCard",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "amountUsed": "Money",
    "balance": "Money",
    "id": "ID",
    "lastCharacters": "String"
  },
  "implementsNode": true
};
Object.freeze(AppliedGiftCard.fieldBaseTypes);
var AppliedGiftCard$1 = Object.freeze(AppliedGiftCard);

const QueryRoot = {
  "name": "QueryRoot",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "customer": "Customer",
    "node": "Node",
    "shop": "Shop"
  },
  "implementsNode": false
};
Object.freeze(QueryRoot.fieldBaseTypes);
var QueryRoot$1 = Object.freeze(QueryRoot);

const Shop = {
  "name": "Shop",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "collections": "CollectionConnection",
    "currencyCode": "CurrencyCode",
    "description": "String",
    "moneyFormat": "String",
    "name": "String",
    "primaryDomain": "Domain",
    "privacyPolicy": "ShopPolicy",
    "products": "ProductConnection",
    "refundPolicy": "ShopPolicy",
    "termsOfService": "ShopPolicy"
  },
  "implementsNode": false
};
Object.freeze(Shop.fieldBaseTypes);
var Shop$1 = Object.freeze(Shop);

const Domain = {
  "name": "Domain",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "host": "String",
    "sslEnabled": "Boolean",
    "url": "URL"
  },
  "implementsNode": false
};
Object.freeze(Domain.fieldBaseTypes);
var Domain$1 = Object.freeze(Domain);

const ShopPolicy = {
  "name": "ShopPolicy",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "body": "String",
    "id": "ID",
    "title": "String",
    "url": "URL"
  },
  "implementsNode": true
};
Object.freeze(ShopPolicy.fieldBaseTypes);
var ShopPolicy$1 = Object.freeze(ShopPolicy);

const CollectionSortKeys = {
  "name": "CollectionSortKeys",
  "kind": "ENUM"
};
var CollectionSortKeys$1 = Object.freeze(CollectionSortKeys);

const ProductSortKeys = {
  "name": "ProductSortKeys",
  "kind": "ENUM"
};
var ProductSortKeys$1 = Object.freeze(ProductSortKeys);

const Mutation = {
  "name": "Mutation",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkoutAttributesUpdate": "CheckoutAttributesUpdatePayload",
    "checkoutCompleteFree": "CheckoutCompleteFreePayload",
    "checkoutCompleteWithCreditCard": "CheckoutCompleteWithCreditCardPayload",
    "checkoutCompleteWithTokenizedPayment": "CheckoutCompleteWithTokenizedPaymentPayload",
    "checkoutCreate": "CheckoutCreatePayload",
    "checkoutCustomerAssociate": "CheckoutCustomerAssociatePayload",
    "checkoutCustomerDisassociate": "CheckoutCustomerDisassociatePayload",
    "checkoutEmailUpdate": "CheckoutEmailUpdatePayload",
    "checkoutGiftCardApply": "CheckoutGiftCardApplyPayload",
    "checkoutLineItemsAdd": "CheckoutLineItemsAddPayload",
    "checkoutLineItemsRemove": "CheckoutLineItemsRemovePayload",
    "checkoutLineItemsUpdate": "CheckoutLineItemsUpdatePayload",
    "checkoutShippingAddressUpdate": "CheckoutShippingAddressUpdatePayload",
    "checkoutShippingLineUpdate": "CheckoutShippingLineUpdatePayload",
    "customerAccessTokenCreate": "CustomerAccessTokenCreatePayload",
    "customerAccessTokenDelete": "CustomerAccessTokenDeletePayload",
    "customerAccessTokenRenew": "CustomerAccessTokenRenewPayload",
    "customerActivate": "CustomerActivatePayload",
    "customerAddressCreate": "CustomerAddressCreatePayload",
    "customerAddressDelete": "CustomerAddressDeletePayload",
    "customerAddressUpdate": "CustomerAddressUpdatePayload",
    "customerCreate": "CustomerCreatePayload",
    "customerRecover": "CustomerRecoverPayload",
    "customerReset": "CustomerResetPayload",
    "customerUpdate": "CustomerUpdatePayload"
  },
  "implementsNode": false,
  "relayInputObjectBaseTypes": {
    "checkoutAttributesUpdate": "CheckoutAttributesUpdateInput",
    "checkoutCompleteFree": "CheckoutCompleteFree",
    "checkoutCompleteWithCreditCard": "CheckoutCompleteWithCreditCardInput",
    "checkoutCompleteWithTokenizedPayment": "CheckoutCompleteWithTokenizedPaymentInput",
    "checkoutCreate": "CheckoutCreateInput",
    "checkoutCustomerAssociate": "CheckoutCustomerAssociateInput",
    "checkoutCustomerDisassociate": "CheckoutCustomerDisassociateInput",
    "checkoutEmailUpdate": "CheckoutEmailUpdateInput",
    "checkoutGiftCardApply": "CheckoutGiftCardApplyInput",
    "checkoutLineItemsAdd": "CheckoutLineItemsAddInput",
    "checkoutLineItemsRemove": "CheckoutLineItemsRemoveInput",
    "checkoutShippingAddressUpdate": "CheckoutShippingAddressUpdateInput",
    "checkoutShippingLineUpdate": "CheckoutShippingLineUpdateInput",
    "customerAccessTokenCreate": "CustomerAccessTokenCreateInput",
    "customerAccessTokenDelete": "CustomerAccessTokenDeleteInput",
    "customerAccessTokenRenew": "CustomerAccessTokenRenewInput",
    "customerActivate": "CustomerActivateInput",
    "customerAddressCreate": "CustomerAddressCreateInput",
    "customerAddressDelete": "CustomerAddressDeleteInput",
    "customerAddressUpdate": "CustomerAddressUpdateInput",
    "customerCreate": "CustomerCreateInput",
    "customerRecover": "CustomerRecoverInput",
    "customerReset": "CustomerResetInput"
  }
};
Object.freeze(Mutation.fieldBaseTypes);
Object.freeze(Mutation.relayInputObjectBaseTypes);
var Mutation$1 = Object.freeze(Mutation);

const CheckoutAttributesUpdatePayload = {
  "name": "CheckoutAttributesUpdatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "clientMutationId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutAttributesUpdatePayload.fieldBaseTypes);
var CheckoutAttributesUpdatePayload$1 = Object.freeze(CheckoutAttributesUpdatePayload);

const UserError = {
  "name": "UserError",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "field": "String",
    "message": "String"
  },
  "implementsNode": false
};
Object.freeze(UserError.fieldBaseTypes);
var UserError$1 = Object.freeze(UserError);

const CheckoutAttributesUpdateInput = {
  "name": "CheckoutAttributesUpdateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "checkoutId": "ID",
    "note": "String",
    "customAttributes": "AttributeInput",
    "allowPartialAddresses": "Boolean"
  }
};
Object.freeze(CheckoutAttributesUpdateInput.inputFieldBaseTypes);
var CheckoutAttributesUpdateInput$1 = Object.freeze(CheckoutAttributesUpdateInput);

const AttributeInput = {
  "name": "AttributeInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "key": "String",
    "value": "String"
  }
};
Object.freeze(AttributeInput.inputFieldBaseTypes);
var AttributeInput$1 = Object.freeze(AttributeInput);

const CheckoutCompleteFreePayload = {
  "name": "CheckoutCompleteFreePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "clientMutationId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutCompleteFreePayload.fieldBaseTypes);
var CheckoutCompleteFreePayload$1 = Object.freeze(CheckoutCompleteFreePayload);

const CheckoutCompleteFree = {
  "name": "CheckoutCompleteFree",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "checkoutId": "ID"
  }
};
Object.freeze(CheckoutCompleteFree.inputFieldBaseTypes);
var CheckoutCompleteFree$1 = Object.freeze(CheckoutCompleteFree);

const CheckoutCompleteWithCreditCardPayload = {
  "name": "CheckoutCompleteWithCreditCardPayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "clientMutationId": "String",
    "payment": "Payment",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutCompleteWithCreditCardPayload.fieldBaseTypes);
var CheckoutCompleteWithCreditCardPayload$1 = Object.freeze(CheckoutCompleteWithCreditCardPayload);

const Payment = {
  "name": "Payment",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "amount": "Money",
    "billingAddress": "MailingAddress",
    "checkout": "Checkout",
    "creditCard": "CreditCard",
    "errorMessage": "String",
    "id": "ID",
    "idempotencyKey": "String",
    "ready": "Boolean",
    "test": "Boolean",
    "transaction": "Transaction"
  },
  "implementsNode": true
};
Object.freeze(Payment.fieldBaseTypes);
var Payment$1 = Object.freeze(Payment);

const CreditCard = {
  "name": "CreditCard",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "brand": "String",
    "expiryMonth": "Int",
    "expiryYear": "Int",
    "firstDigits": "String",
    "firstName": "String",
    "lastDigits": "String",
    "lastName": "String",
    "maskedNumber": "String"
  },
  "implementsNode": false
};
Object.freeze(CreditCard.fieldBaseTypes);
var CreditCard$1 = Object.freeze(CreditCard);

const Transaction = {
  "name": "Transaction",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "amount": "Money",
    "kind": "TransactionKind",
    "status": "TransactionStatus",
    "test": "Boolean"
  },
  "implementsNode": false
};
Object.freeze(Transaction.fieldBaseTypes);
var Transaction$1 = Object.freeze(Transaction);

const TransactionKind = {
  "name": "TransactionKind",
  "kind": "ENUM"
};
var TransactionKind$1 = Object.freeze(TransactionKind);

const TransactionStatus = {
  "name": "TransactionStatus",
  "kind": "ENUM"
};
var TransactionStatus$1 = Object.freeze(TransactionStatus);

const CheckoutCompleteWithCreditCardInput = {
  "name": "CheckoutCompleteWithCreditCardInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "checkoutId": "ID",
    "amount": "Money",
    "idempotencyKey": "String",
    "billingAddress": "MailingAddressInput",
    "vaultId": "String",
    "test": "Boolean"
  }
};
Object.freeze(CheckoutCompleteWithCreditCardInput.inputFieldBaseTypes);
var CheckoutCompleteWithCreditCardInput$1 = Object.freeze(CheckoutCompleteWithCreditCardInput);

const MailingAddressInput = {
  "name": "MailingAddressInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "address1": "String",
    "address2": "String",
    "city": "String",
    "company": "String",
    "country": "String",
    "firstName": "String",
    "lastName": "String",
    "phone": "String",
    "province": "String",
    "zip": "String"
  }
};
Object.freeze(MailingAddressInput.inputFieldBaseTypes);
var MailingAddressInput$1 = Object.freeze(MailingAddressInput);

const CheckoutCompleteWithTokenizedPaymentPayload = {
  "name": "CheckoutCompleteWithTokenizedPaymentPayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "clientMutationId": "String",
    "payment": "Payment",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutCompleteWithTokenizedPaymentPayload.fieldBaseTypes);
var CheckoutCompleteWithTokenizedPaymentPayload$1 = Object.freeze(CheckoutCompleteWithTokenizedPaymentPayload);

const CheckoutCompleteWithTokenizedPaymentInput = {
  "name": "CheckoutCompleteWithTokenizedPaymentInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "checkoutId": "ID",
    "amount": "Money",
    "idempotencyKey": "String",
    "billingAddress": "MailingAddressInput",
    "type": "String",
    "paymentData": "String",
    "test": "Boolean",
    "identifier": "String"
  }
};
Object.freeze(CheckoutCompleteWithTokenizedPaymentInput.inputFieldBaseTypes);
var CheckoutCompleteWithTokenizedPaymentInput$1 = Object.freeze(CheckoutCompleteWithTokenizedPaymentInput);

const CheckoutCreatePayload = {
  "name": "CheckoutCreatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutCreatePayload.fieldBaseTypes);
var CheckoutCreatePayload$1 = Object.freeze(CheckoutCreatePayload);

const CheckoutCreateInput = {
  "name": "CheckoutCreateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "email": "String",
    "lineItems": "CheckoutLineItemInput",
    "shippingAddress": "MailingAddressInput",
    "note": "String",
    "customAttributes": "AttributeInput",
    "allowPartialAddresses": "Boolean"
  }
};
Object.freeze(CheckoutCreateInput.inputFieldBaseTypes);
var CheckoutCreateInput$1 = Object.freeze(CheckoutCreateInput);

const CheckoutLineItemInput = {
  "name": "CheckoutLineItemInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "variantId": "ID",
    "quantity": "Int",
    "customAttributes": "AttributeInput"
  }
};
Object.freeze(CheckoutLineItemInput.inputFieldBaseTypes);
var CheckoutLineItemInput$1 = Object.freeze(CheckoutLineItemInput);

const CheckoutCustomerAssociatePayload = {
  "name": "CheckoutCustomerAssociatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "clientMutationId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutCustomerAssociatePayload.fieldBaseTypes);
var CheckoutCustomerAssociatePayload$1 = Object.freeze(CheckoutCustomerAssociatePayload);

const CheckoutCustomerAssociateInput = {
  "name": "CheckoutCustomerAssociateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "checkoutId": "ID",
    "customerAccessToken": "String"
  }
};
Object.freeze(CheckoutCustomerAssociateInput.inputFieldBaseTypes);
var CheckoutCustomerAssociateInput$1 = Object.freeze(CheckoutCustomerAssociateInput);

const CheckoutCustomerDisassociatePayload = {
  "name": "CheckoutCustomerDisassociatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "clientMutationId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutCustomerDisassociatePayload.fieldBaseTypes);
var CheckoutCustomerDisassociatePayload$1 = Object.freeze(CheckoutCustomerDisassociatePayload);

const CheckoutCustomerDisassociateInput = {
  "name": "CheckoutCustomerDisassociateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "checkoutId": "ID"
  }
};
Object.freeze(CheckoutCustomerDisassociateInput.inputFieldBaseTypes);
var CheckoutCustomerDisassociateInput$1 = Object.freeze(CheckoutCustomerDisassociateInput);

const CheckoutEmailUpdatePayload = {
  "name": "CheckoutEmailUpdatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "clientMutationId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutEmailUpdatePayload.fieldBaseTypes);
var CheckoutEmailUpdatePayload$1 = Object.freeze(CheckoutEmailUpdatePayload);

const CheckoutEmailUpdateInput = {
  "name": "CheckoutEmailUpdateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "checkoutId": "ID",
    "email": "String"
  }
};
Object.freeze(CheckoutEmailUpdateInput.inputFieldBaseTypes);
var CheckoutEmailUpdateInput$1 = Object.freeze(CheckoutEmailUpdateInput);

const CheckoutGiftCardApplyPayload = {
  "name": "CheckoutGiftCardApplyPayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "clientMutationId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutGiftCardApplyPayload.fieldBaseTypes);
var CheckoutGiftCardApplyPayload$1 = Object.freeze(CheckoutGiftCardApplyPayload);

const CheckoutGiftCardApplyInput = {
  "name": "CheckoutGiftCardApplyInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "giftCardCode": "String",
    "checkoutId": "ID"
  }
};
Object.freeze(CheckoutGiftCardApplyInput.inputFieldBaseTypes);
var CheckoutGiftCardApplyInput$1 = Object.freeze(CheckoutGiftCardApplyInput);

const CheckoutLineItemsAddPayload = {
  "name": "CheckoutLineItemsAddPayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "clientMutationId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutLineItemsAddPayload.fieldBaseTypes);
var CheckoutLineItemsAddPayload$1 = Object.freeze(CheckoutLineItemsAddPayload);

const CheckoutLineItemsAddInput = {
  "name": "CheckoutLineItemsAddInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "lineItems": "CheckoutLineItemInput",
    "checkoutId": "ID"
  }
};
Object.freeze(CheckoutLineItemsAddInput.inputFieldBaseTypes);
var CheckoutLineItemsAddInput$1 = Object.freeze(CheckoutLineItemsAddInput);

const CheckoutLineItemsRemovePayload = {
  "name": "CheckoutLineItemsRemovePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "clientMutationId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutLineItemsRemovePayload.fieldBaseTypes);
var CheckoutLineItemsRemovePayload$1 = Object.freeze(CheckoutLineItemsRemovePayload);

const CheckoutLineItemsRemoveInput = {
  "name": "CheckoutLineItemsRemoveInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "checkoutId": "ID",
    "lineItemIds": "ID"
  }
};
Object.freeze(CheckoutLineItemsRemoveInput.inputFieldBaseTypes);
var CheckoutLineItemsRemoveInput$1 = Object.freeze(CheckoutLineItemsRemoveInput);

const CheckoutLineItemsUpdatePayload = {
  "name": "CheckoutLineItemsUpdatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutLineItemsUpdatePayload.fieldBaseTypes);
var CheckoutLineItemsUpdatePayload$1 = Object.freeze(CheckoutLineItemsUpdatePayload);

const CheckoutLineItemUpdateInput = {
  "name": "CheckoutLineItemUpdateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "id": "ID",
    "variantId": "ID",
    "quantity": "Int",
    "customAttributes": "AttributeInput"
  }
};
Object.freeze(CheckoutLineItemUpdateInput.inputFieldBaseTypes);
var CheckoutLineItemUpdateInput$1 = Object.freeze(CheckoutLineItemUpdateInput);

const CheckoutShippingAddressUpdatePayload = {
  "name": "CheckoutShippingAddressUpdatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "clientMutationId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutShippingAddressUpdatePayload.fieldBaseTypes);
var CheckoutShippingAddressUpdatePayload$1 = Object.freeze(CheckoutShippingAddressUpdatePayload);

const CheckoutShippingAddressUpdateInput = {
  "name": "CheckoutShippingAddressUpdateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "shippingAddress": "MailingAddressInput",
    "checkoutId": "ID"
  }
};
Object.freeze(CheckoutShippingAddressUpdateInput.inputFieldBaseTypes);
var CheckoutShippingAddressUpdateInput$1 = Object.freeze(CheckoutShippingAddressUpdateInput);

const CheckoutShippingLineUpdatePayload = {
  "name": "CheckoutShippingLineUpdatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "checkout": "Checkout",
    "clientMutationId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CheckoutShippingLineUpdatePayload.fieldBaseTypes);
var CheckoutShippingLineUpdatePayload$1 = Object.freeze(CheckoutShippingLineUpdatePayload);

const CheckoutShippingLineUpdateInput = {
  "name": "CheckoutShippingLineUpdateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "checkoutId": "ID",
    "shippingRateHandle": "String"
  }
};
Object.freeze(CheckoutShippingLineUpdateInput.inputFieldBaseTypes);
var CheckoutShippingLineUpdateInput$1 = Object.freeze(CheckoutShippingLineUpdateInput);

const CustomerAccessTokenCreatePayload = {
  "name": "CustomerAccessTokenCreatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "clientMutationId": "String",
    "customerAccessToken": "CustomerAccessToken",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CustomerAccessTokenCreatePayload.fieldBaseTypes);
var CustomerAccessTokenCreatePayload$1 = Object.freeze(CustomerAccessTokenCreatePayload);

const CustomerAccessToken = {
  "name": "CustomerAccessToken",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "accessToken": "String",
    "expiresAt": "DateTime"
  },
  "implementsNode": false
};
Object.freeze(CustomerAccessToken.fieldBaseTypes);
var CustomerAccessToken$1 = Object.freeze(CustomerAccessToken);

const CustomerAccessTokenCreateInput = {
  "name": "CustomerAccessTokenCreateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "email": "String",
    "password": "String"
  }
};
Object.freeze(CustomerAccessTokenCreateInput.inputFieldBaseTypes);
var CustomerAccessTokenCreateInput$1 = Object.freeze(CustomerAccessTokenCreateInput);

const CustomerAccessTokenDeletePayload = {
  "name": "CustomerAccessTokenDeletePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "clientMutationId": "String",
    "deletedAccessToken": "String",
    "deletedCustomerAccessTokenId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CustomerAccessTokenDeletePayload.fieldBaseTypes);
var CustomerAccessTokenDeletePayload$1 = Object.freeze(CustomerAccessTokenDeletePayload);

const CustomerAccessTokenDeleteInput = {
  "name": "CustomerAccessTokenDeleteInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "customerAccessToken": "String"
  }
};
Object.freeze(CustomerAccessTokenDeleteInput.inputFieldBaseTypes);
var CustomerAccessTokenDeleteInput$1 = Object.freeze(CustomerAccessTokenDeleteInput);

const CustomerAccessTokenRenewPayload = {
  "name": "CustomerAccessTokenRenewPayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "clientMutationId": "String",
    "customerAccessToken": "CustomerAccessToken",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CustomerAccessTokenRenewPayload.fieldBaseTypes);
var CustomerAccessTokenRenewPayload$1 = Object.freeze(CustomerAccessTokenRenewPayload);

const CustomerAccessTokenRenewInput = {
  "name": "CustomerAccessTokenRenewInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "customerAccessToken": "String"
  }
};
Object.freeze(CustomerAccessTokenRenewInput.inputFieldBaseTypes);
var CustomerAccessTokenRenewInput$1 = Object.freeze(CustomerAccessTokenRenewInput);

const CustomerActivatePayload = {
  "name": "CustomerActivatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "clientMutationId": "String",
    "customer": "Customer",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CustomerActivatePayload.fieldBaseTypes);
var CustomerActivatePayload$1 = Object.freeze(CustomerActivatePayload);

const CustomerActivateInput = {
  "name": "CustomerActivateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "id": "ID",
    "resetToken": "String",
    "password": "String"
  }
};
Object.freeze(CustomerActivateInput.inputFieldBaseTypes);
var CustomerActivateInput$1 = Object.freeze(CustomerActivateInput);

const CustomerAddressCreatePayload = {
  "name": "CustomerAddressCreatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "clientMutationId": "String",
    "customerAddress": "MailingAddress",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CustomerAddressCreatePayload.fieldBaseTypes);
var CustomerAddressCreatePayload$1 = Object.freeze(CustomerAddressCreatePayload);

const CustomerAddressCreateInput = {
  "name": "CustomerAddressCreateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "customerAccessToken": "String",
    "address": "MailingAddressInput"
  }
};
Object.freeze(CustomerAddressCreateInput.inputFieldBaseTypes);
var CustomerAddressCreateInput$1 = Object.freeze(CustomerAddressCreateInput);

const CustomerAddressDeletePayload = {
  "name": "CustomerAddressDeletePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "clientMutationId": "String",
    "deletedCustomerAddressId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CustomerAddressDeletePayload.fieldBaseTypes);
var CustomerAddressDeletePayload$1 = Object.freeze(CustomerAddressDeletePayload);

const CustomerAddressDeleteInput = {
  "name": "CustomerAddressDeleteInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "id": "ID",
    "customerAccessToken": "String"
  }
};
Object.freeze(CustomerAddressDeleteInput.inputFieldBaseTypes);
var CustomerAddressDeleteInput$1 = Object.freeze(CustomerAddressDeleteInput);

const CustomerAddressUpdatePayload = {
  "name": "CustomerAddressUpdatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "clientMutationId": "String",
    "customerAddress": "MailingAddress",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CustomerAddressUpdatePayload.fieldBaseTypes);
var CustomerAddressUpdatePayload$1 = Object.freeze(CustomerAddressUpdatePayload);

const CustomerAddressUpdateInput = {
  "name": "CustomerAddressUpdateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "customerAccessToken": "String",
    "id": "ID",
    "address": "MailingAddressInput"
  }
};
Object.freeze(CustomerAddressUpdateInput.inputFieldBaseTypes);
var CustomerAddressUpdateInput$1 = Object.freeze(CustomerAddressUpdateInput);

const CustomerCreatePayload = {
  "name": "CustomerCreatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "customer": "Customer",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CustomerCreatePayload.fieldBaseTypes);
var CustomerCreatePayload$1 = Object.freeze(CustomerCreatePayload);

const CustomerCreateInput = {
  "name": "CustomerCreateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "firstName": "String",
    "lastName": "String",
    "email": "String",
    "password": "String",
    "acceptsMarketing": "Boolean"
  }
};
Object.freeze(CustomerCreateInput.inputFieldBaseTypes);
var CustomerCreateInput$1 = Object.freeze(CustomerCreateInput);

const CustomerRecoverPayload = {
  "name": "CustomerRecoverPayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "clientMutationId": "String",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CustomerRecoverPayload.fieldBaseTypes);
var CustomerRecoverPayload$1 = Object.freeze(CustomerRecoverPayload);

const CustomerRecoverInput = {
  "name": "CustomerRecoverInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "email": "String"
  }
};
Object.freeze(CustomerRecoverInput.inputFieldBaseTypes);
var CustomerRecoverInput$1 = Object.freeze(CustomerRecoverInput);

const CustomerResetPayload = {
  "name": "CustomerResetPayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "clientMutationId": "String",
    "customer": "Customer",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CustomerResetPayload.fieldBaseTypes);
var CustomerResetPayload$1 = Object.freeze(CustomerResetPayload);

const CustomerResetInput = {
  "name": "CustomerResetInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "clientMutationId": "String",
    "id": "ID",
    "resetToken": "String",
    "password": "String"
  }
};
Object.freeze(CustomerResetInput.inputFieldBaseTypes);
var CustomerResetInput$1 = Object.freeze(CustomerResetInput);

const CustomerUpdatePayload = {
  "name": "CustomerUpdatePayload",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "customer": "Customer",
    "userErrors": "UserError"
  },
  "implementsNode": false
};
Object.freeze(CustomerUpdatePayload.fieldBaseTypes);
var CustomerUpdatePayload$1 = Object.freeze(CustomerUpdatePayload);

const CustomerUpdateInput = {
  "name": "CustomerUpdateInput",
  "kind": "INPUT_OBJECT",
  "inputFieldBaseTypes": {
    "firstName": "String",
    "lastName": "String",
    "email": "String",
    "password": "String",
    "acceptsMarketing": "Boolean"
  }
};
Object.freeze(CustomerUpdateInput.inputFieldBaseTypes);
var CustomerUpdateInput$1 = Object.freeze(CustomerUpdateInput);

const __Schema = {
  "name": "__Schema",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "directives": "__Directive",
    "mutationType": "__Type",
    "queryType": "__Type",
    "subscriptionType": "__Type",
    "types": "__Type"
  },
  "implementsNode": false
};
Object.freeze(__Schema.fieldBaseTypes);
var __Schema$1 = Object.freeze(__Schema);

const __Type = {
  "name": "__Type",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "description": "String",
    "enumValues": "__EnumValue",
    "fields": "__Field",
    "inputFields": "__InputValue",
    "interfaces": "__Type",
    "kind": "__TypeKind",
    "name": "String",
    "ofType": "__Type",
    "possibleTypes": "__Type"
  },
  "implementsNode": false
};
Object.freeze(__Type.fieldBaseTypes);
var __Type$1 = Object.freeze(__Type);

const __TypeKind = {
  "name": "__TypeKind",
  "kind": "ENUM"
};
var __TypeKind$1 = Object.freeze(__TypeKind);

const __Field = {
  "name": "__Field",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "args": "__InputValue",
    "deprecationReason": "String",
    "description": "String",
    "isDeprecated": "Boolean",
    "name": "String",
    "type": "__Type"
  },
  "implementsNode": false
};
Object.freeze(__Field.fieldBaseTypes);
var __Field$1 = Object.freeze(__Field);

const __InputValue = {
  "name": "__InputValue",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "defaultValue": "String",
    "description": "String",
    "name": "String",
    "type": "__Type"
  },
  "implementsNode": false
};
Object.freeze(__InputValue.fieldBaseTypes);
var __InputValue$1 = Object.freeze(__InputValue);

const __EnumValue = {
  "name": "__EnumValue",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "deprecationReason": "String",
    "description": "String",
    "isDeprecated": "Boolean",
    "name": "String"
  },
  "implementsNode": false
};
Object.freeze(__EnumValue.fieldBaseTypes);
var __EnumValue$1 = Object.freeze(__EnumValue);

const __Directive = {
  "name": "__Directive",
  "kind": "OBJECT",
  "fieldBaseTypes": {
    "args": "__InputValue",
    "description": "String",
    "locations": "__DirectiveLocation",
    "name": "String",
    "onField": "Boolean",
    "onFragment": "Boolean",
    "onOperation": "Boolean"
  },
  "implementsNode": false
};
Object.freeze(__Directive.fieldBaseTypes);
var __Directive$1 = Object.freeze(__Directive);

const __DirectiveLocation = {
  "name": "__DirectiveLocation",
  "kind": "ENUM"
};
var __DirectiveLocation$1 = Object.freeze(__DirectiveLocation);

const Types = {
  types: {}
};
Types.types["Checkout"] = Checkout$1;
Types.types["ID"] = ID$1;
Types.types["Boolean"] = Boolean$1;
Types.types["CheckoutLineItemConnection"] = CheckoutLineItemConnection$1;
Types.types["PageInfo"] = PageInfo$1;
Types.types["CheckoutLineItemEdge"] = CheckoutLineItemEdge$1;
Types.types["String"] = String$1;
Types.types["CheckoutLineItem"] = CheckoutLineItem$1;
Types.types["ProductVariant"] = ProductVariant$1;
Types.types["Float"] = Float$1;
Types.types["WeightUnit"] = WeightUnit$1;
Types.types["Money"] = Money$1;
Types.types["Image"] = Image$1;
Types.types["URL"] = URL$1;
Types.types["Int"] = Int$1;
Types.types["CropRegion"] = CropRegion$1;
Types.types["SelectedOption"] = SelectedOption$1;
Types.types["Product"] = Product$1;
Types.types["CollectionConnection"] = CollectionConnection$1;
Types.types["CollectionEdge"] = CollectionEdge$1;
Types.types["Collection"] = Collection$1;
Types.types["HTML"] = HTML$1;
Types.types["DateTime"] = DateTime$1;
Types.types["ProductConnection"] = ProductConnection$1;
Types.types["ProductEdge"] = ProductEdge$1;
Types.types["Node"] = Node$1;
Types.types["ImageConnection"] = ImageConnection$1;
Types.types["ImageEdge"] = ImageEdge$1;
Types.types["ProductOption"] = ProductOption$1;
Types.types["ProductVariantConnection"] = ProductVariantConnection$1;
Types.types["ProductVariantEdge"] = ProductVariantEdge$1;
Types.types["Attribute"] = Attribute$1;
Types.types["MailingAddress"] = MailingAddress$1;
Types.types["ShippingRate"] = ShippingRate$1;
Types.types["AvailableShippingRates"] = AvailableShippingRates$1;
Types.types["Customer"] = Customer$1;
Types.types["MailingAddressConnection"] = MailingAddressConnection$1;
Types.types["MailingAddressEdge"] = MailingAddressEdge$1;
Types.types["OrderConnection"] = OrderConnection$1;
Types.types["OrderEdge"] = OrderEdge$1;
Types.types["Order"] = Order$1;
Types.types["OrderCancelReason"] = OrderCancelReason$1;
Types.types["CurrencyCode"] = CurrencyCode$1;
Types.types["OrderDisplayFulfillmentStatus"] = OrderDisplayFulfillmentStatus$1;
Types.types["OrderDisplayFinancialStatus"] = OrderDisplayFinancialStatus$1;
Types.types["OrderLineItemConnection"] = OrderLineItemConnection$1;
Types.types["OrderLineItemEdge"] = OrderLineItemEdge$1;
Types.types["OrderLineItem"] = OrderLineItem$1;
Types.types["OrderSortKeys"] = OrderSortKeys$1;
Types.types["AppliedGiftCard"] = AppliedGiftCard$1;
Types.types["QueryRoot"] = QueryRoot$1;
Types.types["Shop"] = Shop$1;
Types.types["Domain"] = Domain$1;
Types.types["ShopPolicy"] = ShopPolicy$1;
Types.types["CollectionSortKeys"] = CollectionSortKeys$1;
Types.types["ProductSortKeys"] = ProductSortKeys$1;
Types.types["Mutation"] = Mutation$1;
Types.types["CheckoutAttributesUpdatePayload"] = CheckoutAttributesUpdatePayload$1;
Types.types["UserError"] = UserError$1;
Types.types["CheckoutAttributesUpdateInput"] = CheckoutAttributesUpdateInput$1;
Types.types["AttributeInput"] = AttributeInput$1;
Types.types["CheckoutCompleteFreePayload"] = CheckoutCompleteFreePayload$1;
Types.types["CheckoutCompleteFree"] = CheckoutCompleteFree$1;
Types.types["CheckoutCompleteWithCreditCardPayload"] = CheckoutCompleteWithCreditCardPayload$1;
Types.types["Payment"] = Payment$1;
Types.types["CreditCard"] = CreditCard$1;
Types.types["Transaction"] = Transaction$1;
Types.types["TransactionKind"] = TransactionKind$1;
Types.types["TransactionStatus"] = TransactionStatus$1;
Types.types["CheckoutCompleteWithCreditCardInput"] = CheckoutCompleteWithCreditCardInput$1;
Types.types["MailingAddressInput"] = MailingAddressInput$1;
Types.types["CheckoutCompleteWithTokenizedPaymentPayload"] = CheckoutCompleteWithTokenizedPaymentPayload$1;
Types.types["CheckoutCompleteWithTokenizedPaymentInput"] = CheckoutCompleteWithTokenizedPaymentInput$1;
Types.types["CheckoutCreatePayload"] = CheckoutCreatePayload$1;
Types.types["CheckoutCreateInput"] = CheckoutCreateInput$1;
Types.types["CheckoutLineItemInput"] = CheckoutLineItemInput$1;
Types.types["CheckoutCustomerAssociatePayload"] = CheckoutCustomerAssociatePayload$1;
Types.types["CheckoutCustomerAssociateInput"] = CheckoutCustomerAssociateInput$1;
Types.types["CheckoutCustomerDisassociatePayload"] = CheckoutCustomerDisassociatePayload$1;
Types.types["CheckoutCustomerDisassociateInput"] = CheckoutCustomerDisassociateInput$1;
Types.types["CheckoutEmailUpdatePayload"] = CheckoutEmailUpdatePayload$1;
Types.types["CheckoutEmailUpdateInput"] = CheckoutEmailUpdateInput$1;
Types.types["CheckoutGiftCardApplyPayload"] = CheckoutGiftCardApplyPayload$1;
Types.types["CheckoutGiftCardApplyInput"] = CheckoutGiftCardApplyInput$1;
Types.types["CheckoutLineItemsAddPayload"] = CheckoutLineItemsAddPayload$1;
Types.types["CheckoutLineItemsAddInput"] = CheckoutLineItemsAddInput$1;
Types.types["CheckoutLineItemsRemovePayload"] = CheckoutLineItemsRemovePayload$1;
Types.types["CheckoutLineItemsRemoveInput"] = CheckoutLineItemsRemoveInput$1;
Types.types["CheckoutLineItemsUpdatePayload"] = CheckoutLineItemsUpdatePayload$1;
Types.types["CheckoutLineItemUpdateInput"] = CheckoutLineItemUpdateInput$1;
Types.types["CheckoutShippingAddressUpdatePayload"] = CheckoutShippingAddressUpdatePayload$1;
Types.types["CheckoutShippingAddressUpdateInput"] = CheckoutShippingAddressUpdateInput$1;
Types.types["CheckoutShippingLineUpdatePayload"] = CheckoutShippingLineUpdatePayload$1;
Types.types["CheckoutShippingLineUpdateInput"] = CheckoutShippingLineUpdateInput$1;
Types.types["CustomerAccessTokenCreatePayload"] = CustomerAccessTokenCreatePayload$1;
Types.types["CustomerAccessToken"] = CustomerAccessToken$1;
Types.types["CustomerAccessTokenCreateInput"] = CustomerAccessTokenCreateInput$1;
Types.types["CustomerAccessTokenDeletePayload"] = CustomerAccessTokenDeletePayload$1;
Types.types["CustomerAccessTokenDeleteInput"] = CustomerAccessTokenDeleteInput$1;
Types.types["CustomerAccessTokenRenewPayload"] = CustomerAccessTokenRenewPayload$1;
Types.types["CustomerAccessTokenRenewInput"] = CustomerAccessTokenRenewInput$1;
Types.types["CustomerActivatePayload"] = CustomerActivatePayload$1;
Types.types["CustomerActivateInput"] = CustomerActivateInput$1;
Types.types["CustomerAddressCreatePayload"] = CustomerAddressCreatePayload$1;
Types.types["CustomerAddressCreateInput"] = CustomerAddressCreateInput$1;
Types.types["CustomerAddressDeletePayload"] = CustomerAddressDeletePayload$1;
Types.types["CustomerAddressDeleteInput"] = CustomerAddressDeleteInput$1;
Types.types["CustomerAddressUpdatePayload"] = CustomerAddressUpdatePayload$1;
Types.types["CustomerAddressUpdateInput"] = CustomerAddressUpdateInput$1;
Types.types["CustomerCreatePayload"] = CustomerCreatePayload$1;
Types.types["CustomerCreateInput"] = CustomerCreateInput$1;
Types.types["CustomerRecoverPayload"] = CustomerRecoverPayload$1;
Types.types["CustomerRecoverInput"] = CustomerRecoverInput$1;
Types.types["CustomerResetPayload"] = CustomerResetPayload$1;
Types.types["CustomerResetInput"] = CustomerResetInput$1;
Types.types["CustomerUpdatePayload"] = CustomerUpdatePayload$1;
Types.types["CustomerUpdateInput"] = CustomerUpdateInput$1;
Types.types["__Schema"] = __Schema$1;
Types.types["__Type"] = __Type$1;
Types.types["__TypeKind"] = __TypeKind$1;
Types.types["__Field"] = __Field$1;
Types.types["__InputValue"] = __InputValue$1;
Types.types["__EnumValue"] = __EnumValue$1;
Types.types["__Directive"] = __Directive$1;
Types.types["__DirectiveLocation"] = __DirectiveLocation$1;
Types.queryType = "QueryRoot";
Types.mutationType = "Mutation";
Types.subscriptionType = null;
Object.freeze(Types.types);
var types = Object.freeze(Types);

export default types;
