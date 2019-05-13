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