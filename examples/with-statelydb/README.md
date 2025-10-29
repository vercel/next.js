# StatelyTV Demo

A hands-on teaching application demonstrating [StatelyDB](https://stately.cloud) concepts through a Netflix-style streaming platform. Explore channels, shows, and characters while learning how StatelyDB's elastic schema and access patterns work in practice.

[![Build with Stately](https://console.stately.cloud/button.svg)](https://console.stately.cloud/new?repo=https%3A%2F%2Fgithub.com%2FStatelyCloud%2Fstatelytv-demo)

## What You'll Learn

This demo showcases key StatelyDB features:

- **Elastic Schema**: See how StatelyDB's TypeScript-based schema (in `./schema/schema.ts`) defines data models with typed fields, UUIDs, and metadata
- **Multiple Access Patterns**: Explore how items can be queried through different keyPaths (e.g., direct access via `/show-:showId` or hierarchical via `/channel-:channelId/show-:showId`)
- **CRUD Operations**: Use the admin dashboard to create, read, update, and delete entities without writing code
- **Hierarchical Relationships**: Understand parent-child relationships (Channel → Shows → Characters)
- **Real-time Queries**: See how StatelyDB fetches data using different access patterns in a real application

## Getting Started

Clicking the **Build** button above will bootstrap a new free cloud hosted store provisioned specifically for this app. Once that's done you can either run this app locally or on Vercel!

1. Clone this Repo:
```bash setup Clone the Repo
git clone https://github.com/StatelyCloud/statelytv-demo
cd statelytv-demo
```

2. Install dependencies & Login:
```bash setup Install Dependencies & Login
npm install
npm run login
```

3. Generate the SDK
```bash setup Generate the SDK
npm run generate -- --language typescript --schema-id $SCHEMA_ID ./lib/schema
```

4. Run the development server:
```bash setup Run the Application
npm run dev
```

5. Open [http://localhost:8300](http://localhost:8300) to see the app

6. Bootstrap demo data when prompted (or visit `/admin/bootstrap`)

## Deploy
After you've successfully setup your StatelyDB Store. You can deploy this application to Vercel.

>Before clicking Deploy, make note of the `STATELY_STORE_ID` and `STATELY_ACCESS_KEY` provisioned above by using [our console](https://console.stately.cloud). You will be asked to provide them.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FStatelyCloud%2Fstatelytv-demo&env=STATELY_STORE_ID,STATELY_ACCESS_KEY&envDescription=API%20keys%20and%20Store%20configuration.&envLink=https%3A%2F%2Fdocs.stately.cloud%2Fguides%2Fconnect%2F&skippable-integrations=1)


After Vercel has cloned this repo, you **must** repeate the steps above to generating the SDK in your new repo, and then push those changes.

## Exploring the Demo

### 1. Explore the Schema (`./schema/schema.ts`)
Start by examining the elastic schema to understand:
- How `itemType` defines data models
- How multiple keyPaths enable different query patterns
- How fields are typed and how metadata is captured

### 2. Use the Admin Dashboard (`/admin`)
Experiment with CRUD operations to see StatelyDB in action:
- Create channels, shows, and characters
- Edit existing items and observe updates
- Delete items to understand cascading relationships
- View metadata (createdAt, updatedAt) on each entity

### 3. Browse the UI
Navigate the main interface to see how data is queried:
- Browse channels on the home page
- View shows within a channel (hierarchical access)
- Explore characters within a show (nested relationships)

### 4. Examine the Code
Look at how the app interacts with StatelyDB:
- Check `lib/actions.ts` for data fetching patterns
- See how keyPaths are used for different query scenarios
- Understand how StatelyDB's client library is integrated

### 5. Experiment and Reset
Try different scenarios:
- Create your own data structure
- Test edge cases (empty channels, multiple characters)
- Use the "Reset Data" button in admin to start fresh anytime

## Key Files

- `schema/schema.ts` - StatelyDB elastic schema definition
- `lib/actions.ts` - Server actions for StatelyDB operations
- `app/admin/page.tsx` - Admin dashboard for CRUD operations
- `app/page.tsx` - Main browsing interface

## Learn More

- [StatelyDB Documentation](https://docs.stately.cloud)
- [StatelyDB Schema Guide](https://docs.stately.cloud/schema)
- [Next.js Documentation](https://nextjs.org/docs)
