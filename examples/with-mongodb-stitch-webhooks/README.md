# REACT + MONGO STITCH EXAMPLE

## Tech stack of the app

ReactJS, 
Redux, 
Redux-Saga,
NextJS,
MongoDB-Atlas,
MongoDB-Stitch,
AWS S3 

## How to use

# To run the app:

1. Create account on the mongodb-atlas
2. Create cluster and populate some dummy data to the mongodb collection at that cluster
3. Create the application at mognodb-stitch
4. To been able to use the app with nextjs( isomorphic application ) create separate webhooks at mongodb-stitch, because currently mongodb-stitch client for browser and server does not work with isomorphic apps.
5. To give the ability to use Auth API of the mongodb-atlas, enable the type of the auth service provided by mongo-atlas.
6. To give the ability to upload pictures and othe files, register on AWS S3 and create the bucket for files.
7. Create AWS external service in mongo-stitch.
8. Populate your achieved credentials to the .ENV file and you should be ready to rock.


### Install now globally with 
```
npm i -g now
npm i -g nodemon
```

### To run the app locally execute: 
```
yarn
```
 ```
yarn dev
``` 
### To deploy the app to now zeit:
```
now
```

## The idea behind the app template
This app is using nextjs, so it is isomorphic application(so there is no easy solution to plug in the mongodb-stitch-sdk).
This example shows one of the options how to leverage using most of the functionality coming from mongodb-stitch.
There are 3 reducers and 3 redux-sagas, that are responsible for communicating with mongodb-stitch via webhooks.
s3 - is using webhook combined with mongosb-stitch-aws-s3 service.
api - is using webhook to register the user with auth api from mongodb-stitch.
db - is using mongodb-atlas db service to get the data from cloud mongodb instance.

# The template infrastructure:

1. Pages folder is the routing system for the react frontend part of the application. 
2. API folder is the one that creates an express based api by using Zeit Now project, so you do not need to create your custom server.
3. Server folder contains the replica of the API functionality, so you could run it locally and test how the app works.
4. Redux is included into: actions, reducers and sagas folders.
5. Communication with the MongoDB Stitch is made via stitch-webhooks folder.
6. Redux store is configured in the store.js file.
7. The app is using 'dotenv' library to populate the environment variables to the app running locally.
8. To inject environment variables in the production ready app use next.config.js
9. The webhooks-examples contains the examples of the mongodb-stitch webhooks examples, that you can copy and paste to your account (Do not forget to change the values).

# Examples of the incoming webhooks used by the app from mongodb stitch:

1. Getting the data from mongodb cloud instance:

```
exports = function(payload) {
    const mongodb = context.services.get("<mongo-service>");
    const mycollection = mongodb.db("<db-title>").collection("<collection-title>");
    return mycollection.find({}).toArray();
};
``` 

2. Registering the user with mongodb-atlas auth api:
```
exports = function(payload) {
    const request = EJSON.parse(payload.body.text());
    const http = context.services.get("<app-title>");
    const owner = context.values.get("<username-of-the-app-owner>");
    const apiKey = context.values.get("<api-key>");

    return http.post({
        url: "https://stitch.mongodb.com/api/admin/v3.0/auth/providers/mongodb-cloud/login",
        body: JSON.stringify({
            username: owner,
            apiKey: apiKey
        })
    }).then(response => EJSON.parse(response.body.text()).access_token).then(accessToken => {
        return http.post({
            url: "https://stitch.mongodb.com/api/admin/v3.0/groups/<group-id>/apps/<app-id>/users",
            headers: {
                Authorization: ["Bearer " + accessToken]
            },
            body: JSON.stringify({
                email: request.useremail,
                password: request.userpass
            })
        });
    });
};

```

3. Post files to AWS S3 service via mongodb-stitch:
```
exports = function(payload) {
    //base64EncodedImage, bucket, fileName, fileType
    const body = EJSON.parse(payload.body.text());
    // Convert the base64 encoded image string to a BSON Binary object
    const binaryImageData = BSON.Binary.fromBase64(body.picture, 0);
    // Instantiate an S3 service client
    const s3Service = context.services.get('<aws-s3-service-title>').s3('<location>');
    // Put the object to S3
    return s3Service.PutObject({
        'Bucket': '<aws-bucket-title>',
        'Key': body.fileName,
        'ContentType': body.fileType,
        'Body': binaryImageData
    })
        .then(putObjectOutput => {
            // console.log(putObjectOutput);
            // putObjectOutput: {
            //   ETag: <string>, // The object's S3 entity tag
            // }
            return putObjectOutput;
        })
        .catch(console.error);
    // return body;
};
```