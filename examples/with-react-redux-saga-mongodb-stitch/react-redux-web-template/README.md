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
This app is using nextjs, so it is isomorphic application.
This app is the template for easy to use and fast to deploy react based web apps.

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