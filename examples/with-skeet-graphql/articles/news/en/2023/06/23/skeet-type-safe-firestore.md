---
id: skeet-type-safe-firestore
title: Released an open-source library that can handle Firestore, a NoSQL database, in a type-safe manner
category: Press release
thumbnail: /news/2023/06/23/SkeetTypeSafeFirestore2.png
---

ELSOUL LABO B.V. (Headquarters: Amsterdam, Netherlands) announced on the 23th the release of an open-source library "Skeet Firestore" that can handle Firestore, a serverless NoSQL database on Google Cloud, in a type-safe manner.

Skeet Firestore: https://github.com/elsoul/skeet-firestore

## The serverless NoSQL database "Firestore"

Google Cloud's serverless NoSQL database service "Firestore" is a mobile application backend with real-time query capabilities. His four main characteristics are:

- Ease of Use: You can start developing your application without spending time on preliminary database design. It also supports ACID transactions with strong consistency, unlike common NoSQL databases.
- Fully Serverless Operation and Rapid Scaling: A fully serverless service storing data in a distributed Spanner database running in Google's data centers, enabling fast autoscaling.
- Flexible, Efficient Real-time Queries: Data changes on the database can be notified and reflected to the client in real-time, facilitating real-time UI updates. increase.
- Disconnected Operation: Even if the mobile device is offline, the data can be referenced and written by the local cache and will be reflected in the database when the device is online.

Reference - "Firestore: The NoSQL Serverless Database for the Application Developer (2023)": https://research.google/pubs/pub52292/

Skeet Firestore also uses TypeScript to make the Firestore type-safe, enabling change-resistant software development.

For details, please take a look at the official Skeet document below.

Skeet Official Doc (Skeet Firestore): https://skeet.dev/en/doc/plugins/skeet-firestore/

## What kind of apps can you create? Let's imagine using the demo AI chat app.

![Skeet Demo AI Chat App](/news/2023/06/19/SkeeterAppSample16-9.png)

Skeet is a full-stack serverless framework that lets you build auto-scaling apps on top of Firebase.

Until now, releasing applications and publishing services required the preparation of application code and servers, and the construction and management of servers, in particular, was costly.

The serverless environment provided by Google Cloud and Firebase eliminates the need for this server construction and management. All server infrastructure automatically scales with user usage, eliminating the need for detailed access forecasting and load management resource management.

Skeet can build and manage these serverless products with one command for developing iOS, Android, and web apps. So Skeet developers can immediately start working on the application logic. And the deployment of the written app is guaranteed.

With Skeet, you can quickly build and release applications leveraging OpenAI's ChatGPT API.

We have released the app as a demo after completing the Skeet tutorial.

Skeet Demo AI Chat App: https://skeeter.app/

Like this demo, Skeet has everything you need to develop and publish an application, such as authentication and database usage that applications generally do.

TypeScript is used for both the back-end and front-end, but Python can also be used as a backend for each function if necessary, so it can be used when machine learning is required.

We believe that many useful apps will be created using Skeet, and we will continue to develop and improve the Skeet framework.

## Experience new app development

![Skeet - Full-stack Serverless Framework for auto-scaling apps on Firebase](/news/2023/06/13/EffortlessServerlessSkeet.png)

Experience new app development.

You can immediately develop and publish web, iOS, and Android apps.

With the Skeet tutorial, you can actually build an AI chat app like this demo and have it ready to ship.

We would appreciate it if you could try it.

Skeet Tutorial: https://skeet.dev/en/doc/backend/quickstart/
