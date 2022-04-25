// @ts-nocheck
export default {
  "name": "PetStore",
  "baseUrl": "https://petstore.swagger.io/v2/",
  "operations": [
    {
      "method": "POST",
      "path": "/pet/{args.petId}/uploadImage",
      "type": "mutation",
      "field": "uploadFile",
      "description": "uploads an image",
      "responseByStatusCode": {
        "200": {
          "responseSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1pet~1{petId}~1uploadImage/post/responses/200/schema"
        }
      },
      "argTypeMap": {
        "petId": "Int!",
        "additionalMetadata": "String"
      }
    },
    {
      "method": "POST",
      "path": "/pet",
      "type": "mutation",
      "field": "addPet",
      "description": "Add a new pet to the store",
      "responseByStatusCode": {},
      "requestSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1pet/post/parameters/0/schema",
      "argTypeMap": {
        "body": "ID!"
      }
    },
    {
      "method": "PUT",
      "path": "/pet",
      "type": "mutation",
      "field": "updatePet",
      "description": "Update an existing pet",
      "responseByStatusCode": {},
      "requestSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1pet/put/parameters/0/schema",
      "argTypeMap": {
        "body": "ID!"
      }
    },
    {
      "method": "GET",
      "path": "/pet/findByStatus",
      "type": "query",
      "field": "findPetsByStatus",
      "description": "Multiple status values can be provided with comma separated strings",
      "responseByStatusCode": {
        "200": {
          "responseSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1pet~1findByStatus/get/responses/200/schema"
        }
      },
      "requestSchema": {
        "type": "object",
        "properties": {
          "status": {
            "name": "status",
            "in": "query",
            "description": "Status values that need to be considered for filter",
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "available",
                "pending",
                "sold"
              ],
              "default": "available",
              "title": "queryInput_findPetsByStatus_status_items"
            },
            "collectionFormat": "multi"
          }
        },
        "required": [
          "status"
        ],
        "title": "findPetsByStatus_request"
      },
      "argTypeMap": {
        "status": "ID!"
      }
    },
    {
      "method": "GET",
      "path": "/pet/findByTags",
      "type": "query",
      "field": "findPetsByTags",
      "description": "Multiple tags can be provided with comma separated strings. Use tag1, tag2, tag3 for testing.",
      "responseByStatusCode": {
        "200": {
          "responseSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1pet~1findByTags/get/responses/200/schema"
        }
      },
      "requestSchema": {
        "type": "object",
        "properties": {
          "tags": {
            "name": "tags",
            "in": "query",
            "description": "Tags to filter by",
            "type": "array",
            "items": {
              "type": "string"
            },
            "collectionFormat": "multi"
          }
        },
        "required": [
          "tags"
        ],
        "title": "findPetsByTags_request"
      },
      "argTypeMap": {
        "tags": "ID!"
      }
    },
    {
      "method": "GET",
      "path": "/pet/{args.petId}",
      "type": "query",
      "field": "getPetById",
      "description": "Returns a single pet",
      "responseByStatusCode": {
        "200": {
          "responseSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1pet~1{petId}/get/responses/200/schema"
        }
      },
      "argTypeMap": {
        "petId": "Int!"
      }
    },
    {
      "method": "POST",
      "path": "/pet/{args.petId}",
      "type": "mutation",
      "field": "updatePetWithForm",
      "description": "Updates a pet in the store with form data",
      "responseByStatusCode": {},
      "argTypeMap": {
        "petId": "Int!",
        "name": "String",
        "status": "String"
      }
    },
    {
      "method": "DELETE",
      "path": "/pet/{args.petId}",
      "type": "mutation",
      "field": "deletePet",
      "description": "Deletes a pet",
      "responseByStatusCode": {},
      "headers": {
        "api_key": "{args.api_key}"
      },
      "argTypeMap": {
        "api_key": "String",
        "petId": "Int!"
      }
    },
    {
      "method": "POST",
      "path": "/store/order",
      "type": "mutation",
      "field": "placeOrder",
      "description": "Place an order for a pet",
      "responseByStatusCode": {
        "200": {
          "responseSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1store~1order/post/responses/200/schema"
        }
      },
      "requestSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1store~1order/post/parameters/0/schema",
      "argTypeMap": {
        "body": "ID!"
      }
    },
    {
      "method": "GET",
      "path": "/store/order/{args.orderId}",
      "type": "query",
      "field": "getOrderById",
      "description": "For valid response try integer IDs with value >= 1 and <= 10. Other values will generated exceptions",
      "responseByStatusCode": {
        "200": {
          "responseSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1store~1order~1{orderId}/get/responses/200/schema"
        }
      },
      "argTypeMap": {
        "orderId": "Int!"
      }
    },
    {
      "method": "DELETE",
      "path": "/store/order/{args.orderId}",
      "type": "mutation",
      "field": "deleteOrder",
      "description": "For valid response try integer IDs with positive integer value. Negative or non-integer values will generate API errors",
      "responseByStatusCode": {},
      "argTypeMap": {
        "orderId": "Int!"
      }
    },
    {
      "method": "GET",
      "path": "/store/inventory",
      "type": "query",
      "field": "getInventory",
      "description": "Returns a map of status codes to quantities",
      "responseByStatusCode": {
        "200": {
          "responseSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1store~1inventory/get/responses/200/schema"
        }
      }
    },
    {
      "method": "POST",
      "path": "/user/createWithArray",
      "type": "mutation",
      "field": "createUsersWithArrayInput",
      "description": "Creates list of users with given input array",
      "responseByStatusCode": {},
      "requestSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1user~1createWithArray/post/parameters/0/schema",
      "argTypeMap": {
        "body": "ID!"
      }
    },
    {
      "method": "POST",
      "path": "/user/createWithList",
      "type": "mutation",
      "field": "createUsersWithListInput",
      "description": "Creates list of users with given input array",
      "responseByStatusCode": {},
      "requestSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1user~1createWithList/post/parameters/0/schema",
      "argTypeMap": {
        "body": "ID!"
      }
    },
    {
      "method": "GET",
      "path": "/user/{args.username}",
      "type": "query",
      "field": "getUserByName",
      "description": "Get user by user name",
      "responseByStatusCode": {
        "200": {
          "responseSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1user~1{username}/get/responses/200/schema"
        }
      },
      "argTypeMap": {
        "username": "String!"
      }
    },
    {
      "method": "PUT",
      "path": "/user/{args.username}",
      "type": "mutation",
      "field": "updateUser",
      "description": "This can only be done by the logged in user.",
      "responseByStatusCode": {},
      "argTypeMap": {
        "username": "String!",
        "body": "ID!"
      },
      "requestSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1user~1{username}/put/parameters/1/schema"
    },
    {
      "method": "DELETE",
      "path": "/user/{args.username}",
      "type": "mutation",
      "field": "deleteUser",
      "description": "This can only be done by the logged in user.",
      "responseByStatusCode": {},
      "argTypeMap": {
        "username": "String!"
      }
    },
    {
      "method": "GET",
      "path": "/user/login",
      "type": "query",
      "field": "loginUser",
      "description": "Logs user into the system",
      "responseByStatusCode": {
        "200": {
          "responseSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1user~1login/get/responses/200/schema"
        }
      },
      "requestSchema": {
        "type": "object",
        "properties": {
          "username": {
            "name": "username",
            "in": "query",
            "description": "The user name for login",
            "type": "string"
          },
          "password": {
            "name": "password",
            "in": "query",
            "description": "The password for login in clear text",
            "type": "string"
          }
        },
        "required": [
          "username",
          "password"
        ],
        "title": "loginUser_request"
      },
      "argTypeMap": {
        "username": "String!",
        "password": "String!"
      }
    },
    {
      "method": "GET",
      "path": "/user/logout",
      "type": "query",
      "field": "logoutUser",
      "description": "Logs out current logged in user session",
      "responseByStatusCode": {}
    },
    {
      "method": "POST",
      "path": "/user",
      "type": "mutation",
      "field": "createUser",
      "description": "This can only be done by the logged in user.",
      "responseByStatusCode": {},
      "requestSchema": "https://petstore.swagger.io/v2/swagger.json#/paths/~1user/post/parameters/0/schema",
      "argTypeMap": {
        "body": "ID!"
      }
    }
  ],
  "referencedSchema": {
    "$ref": "#/definitions/_schema",
    "definitions": {
      "int32": {
        "type": "integer",
        "format": "int32",
        "title": "int32"
      },
      "ApiResponse": {
        "type": "object",
        "properties": {
          "code": {
            "$ref": "#/definitions/int32"
          },
          "type": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        },
        "title": "ApiResponse",
        "$resolvedRef": "/definitions/ApiResponse"
      },
      "mutation_addPet_anyOf_0": {
        "type": "object",
        "additionalProperties": true,
        "title": "mutation_addPet_anyOf_0"
      },
      "mutation_addPet_anyOf_2": {
        "type": "number",
        "title": "mutation_addPet_anyOf_2"
      },
      "mutation_addPet_anyOf_3": {
        "type": "boolean",
        "title": "mutation_addPet_anyOf_3"
      },
      "Any": {
        "title": "Any",
        "anyOf": [
          {
            "$ref": "#/definitions/mutation_addPet_anyOf_0"
          },
          {
            "type": "string"
          },
          {
            "$ref": "#/definitions/mutation_addPet_anyOf_2"
          },
          {
            "$ref": "#/definitions/mutation_addPet_anyOf_3"
          }
        ]
      },
      "int64": {
        "type": "integer",
        "format": "int64",
        "title": "int64"
      },
      "date-time": {
        "type": "string",
        "format": "date-time",
        "title": "date-time"
      },
      "mutation_placeOrder_status": {
        "type": "string",
        "description": "Order Status",
        "enum": [
          "placed",
          "approved",
          "delivered"
        ],
        "title": "mutation_placeOrder_status"
      },
      "Order": {
        "type": "object",
        "properties": {
          "id": {
            "$ref": "#/definitions/int64"
          },
          "petId": {
            "$ref": "#/definitions/int64"
          },
          "quantity": {
            "$ref": "#/definitions/int32"
          },
          "shipDate": {
            "$ref": "#/definitions/date-time"
          },
          "status": {
            "$ref": "#/definitions/mutation_placeOrder_status"
          },
          "complete": {
            "$ref": "#/definitions/mutation_addPet_anyOf_3"
          }
        },
        "xml": {
          "name": "Order"
        },
        "title": "Order",
        "$resolvedRef": "/definitions/Order"
      },
      "Mutation": {
        "type": "object",
        "title": "Mutation",
        "properties": {
          "uploadFile": {
            "$ref": "#/definitions/ApiResponse"
          },
          "addPet": {
            "$ref": "#/definitions/Any"
          },
          "updatePet": {
            "$ref": "#/definitions/Any"
          },
          "updatePetWithForm": {
            "$ref": "#/definitions/Any"
          },
          "deletePet": {
            "$ref": "#/definitions/Any"
          },
          "placeOrder": {
            "$ref": "#/definitions/Order"
          },
          "deleteOrder": {
            "$ref": "#/definitions/Any"
          },
          "createUsersWithArrayInput": {
            "$ref": "#/definitions/Any"
          },
          "createUsersWithListInput": {
            "$ref": "#/definitions/Any"
          },
          "updateUser": {
            "$ref": "#/definitions/Any"
          },
          "deleteUser": {
            "$ref": "#/definitions/Any"
          },
          "createUser": {
            "$ref": "#/definitions/Any"
          }
        }
      },
      "Category": {
        "type": "object",
        "properties": {
          "id": {
            "$ref": "#/definitions/int64"
          },
          "name": {
            "type": "string"
          }
        },
        "xml": {
          "name": "Category"
        },
        "title": "Category",
        "$resolvedRef": "/definitions/Category"
      },
      "Tag": {
        "type": "object",
        "properties": {
          "id": {
            "$ref": "#/definitions/int64"
          },
          "name": {
            "type": "string"
          }
        },
        "xml": {
          "name": "Tag"
        },
        "title": "Tag",
        "$resolvedRef": "/definitions/Tag"
      },
      "mutationInput_addPet_status": {
        "type": "string",
        "description": "pet status in the store",
        "enum": [
          "available",
          "pending",
          "sold"
        ],
        "title": "mutationInput_addPet_status"
      },
      "Pet": {
        "type": "object",
        "required": [
          "name",
          "photoUrls"
        ],
        "properties": {
          "id": {
            "$ref": "#/definitions/int64"
          },
          "category": {
            "$ref": "#/definitions/Category"
          },
          "name": {
            "type": "string",
            "example": "doggie"
          },
          "photoUrls": {
            "type": "array",
            "xml": {
              "wrapped": true
            },
            "items": {
              "type": "string",
              "xml": {
                "name": "photoUrl"
              }
            }
          },
          "tags": {
            "type": "array",
            "xml": {
              "wrapped": true
            },
            "items": {
              "$ref": "#/definitions/Tag"
            }
          },
          "status": {
            "$ref": "#/definitions/mutationInput_addPet_status"
          }
        },
        "xml": {
          "name": "Pet"
        },
        "title": "Pet",
        "$resolvedRef": "/definitions/Pet"
      },
      "int322": {
        "type": "integer",
        "format": "int32",
        "description": "User Status",
        "title": "int32"
      },
      "User": {
        "type": "object",
        "properties": {
          "id": {
            "$ref": "#/definitions/int64"
          },
          "username": {
            "type": "string"
          },
          "firstName": {
            "type": "string"
          },
          "lastName": {
            "type": "string"
          },
          "email": {
            "type": "string"
          },
          "password": {
            "type": "string"
          },
          "phone": {
            "type": "string"
          },
          "userStatus": {
            "$ref": "#/definitions/int322"
          }
        },
        "xml": {
          "name": "User"
        },
        "title": "User",
        "$resolvedRef": "/definitions/User"
      },
      "MutationInput": {
        "type": "object",
        "title": "MutationInput",
        "properties": {
          "addPet": {
            "$ref": "#/definitions/Pet"
          },
          "updatePet": {
            "$ref": "#/definitions/Pet"
          },
          "placeOrder": {
            "$ref": "#/definitions/Order"
          },
          "createUsersWithArrayInput": {
            "type": "array",
            "items": {
              "$ref": "#/definitions/User"
            },
            "$resolvedRef": "/paths/~1user~1createWithArray/post/parameters/0/schema"
          },
          "createUsersWithListInput": {
            "type": "array",
            "items": {
              "$ref": "#/definitions/User"
            },
            "$resolvedRef": "/paths/~1user~1createWithList/post/parameters/0/schema"
          },
          "updateUser": {
            "$ref": "#/definitions/User"
          },
          "createUser": {
            "$ref": "#/definitions/User"
          }
        }
      },
      "findPetsByStatus_200_response": {
        "type": "array",
        "items": {
          "$ref": "#/definitions/Pet"
        },
        "$resolvedRef": "/paths/~1pet~1findByStatus/get/responses/200/schema",
        "title": "findPetsByStatus_200_response"
      },
      "findPetsByTags_200_response": {
        "type": "array",
        "items": {
          "$ref": "#/definitions/Pet"
        },
        "$resolvedRef": "/paths/~1pet~1findByTags/get/responses/200/schema",
        "title": "findPetsByTags_200_response"
      },
      "getInventory_200_response": {
        "type": "object",
        "additionalProperties": {
          "$ref": "#/definitions/int32"
        },
        "$resolvedRef": "/paths/~1store~1inventory/get/responses/200/schema",
        "title": "getInventory_200_response"
      },
      "loginUser_200_response": {
        "type": "string",
        "$resolvedRef": "/paths/~1user~1login/get/responses/200/schema",
        "title": "loginUser_200_response"
      },
      "Query": {
        "type": "object",
        "title": "Query",
        "properties": {
          "findPetsByStatus": {
            "$ref": "#/definitions/findPetsByStatus_200_response"
          },
          "findPetsByTags": {
            "$ref": "#/definitions/findPetsByTags_200_response"
          },
          "getPetById": {
            "$ref": "#/definitions/Pet"
          },
          "getOrderById": {
            "$ref": "#/definitions/Order"
          },
          "getInventory": {
            "$ref": "#/definitions/getInventory_200_response"
          },
          "getUserByName": {
            "$ref": "#/definitions/User"
          },
          "loginUser": {
            "$ref": "#/definitions/loginUser_200_response"
          },
          "logoutUser": {
            "$ref": "#/definitions/Any"
          }
        }
      },
      "queryInput_findPetsByStatus_status_items": {
        "type": "string",
        "enum": [
          "available",
          "pending",
          "sold"
        ],
        "default": "available",
        "title": "queryInput_findPetsByStatus_status_items"
      },
      "findPetsByStatus_request": {
        "type": "object",
        "properties": {
          "status": {
            "name": "status",
            "in": "query",
            "description": "Status values that need to be considered for filter",
            "type": "array",
            "items": {
              "$ref": "#/definitions/queryInput_findPetsByStatus_status_items"
            },
            "collectionFormat": "multi"
          }
        },
        "required": [
          "status"
        ],
        "title": "findPetsByStatus_request"
      },
      "findPetsByTags_request": {
        "type": "object",
        "properties": {
          "tags": {
            "name": "tags",
            "in": "query",
            "description": "Tags to filter by",
            "type": "array",
            "items": {
              "type": "string"
            },
            "collectionFormat": "multi"
          }
        },
        "required": [
          "tags"
        ],
        "title": "findPetsByTags_request"
      },
      "loginUser_request": {
        "type": "object",
        "properties": {
          "username": {
            "name": "username",
            "in": "query",
            "description": "The user name for login",
            "type": "string"
          },
          "password": {
            "name": "password",
            "in": "query",
            "description": "The password for login in clear text",
            "type": "string"
          }
        },
        "required": [
          "username",
          "password"
        ],
        "title": "loginUser_request"
      },
      "QueryInput": {
        "type": "object",
        "title": "QueryInput",
        "properties": {
          "findPetsByStatus": {
            "$ref": "#/definitions/findPetsByStatus_request"
          },
          "findPetsByTags": {
            "$ref": "#/definitions/findPetsByTags_request"
          },
          "loginUser": {
            "$ref": "#/definitions/loginUser_request"
          }
        }
      },
      "_schema": {
        "type": "object",
        "title": "_schema",
        "properties": {
          "mutation": {
            "$ref": "#/definitions/Mutation"
          },
          "mutationInput": {
            "$ref": "#/definitions/MutationInput"
          },
          "query": {
            "$ref": "#/definitions/Query"
          },
          "queryInput": {
            "$ref": "#/definitions/QueryInput"
          }
        },
        "required": [
          "query"
        ]
      }
    }
  }
} as any;