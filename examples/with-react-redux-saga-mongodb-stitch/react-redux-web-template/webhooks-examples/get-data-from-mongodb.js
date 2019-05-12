// This function is the webhook's request handler.
exports = function(payload) {
    const mongodb = context.services.get("<mongo-service>");
    const mycollection = mongodb.db("<db-title>").collection("<collection-title>");
    return mycollection.find({}).toArray();
};