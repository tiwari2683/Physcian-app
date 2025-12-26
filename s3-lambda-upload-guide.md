# AWS S3 Upload via Lambda API Endpoint - Comprehensive Guide

This guide provides detailed instructions for setting up a Lambda function that serves as an API endpoint for uploading images and data to an S3 bucket.

## Table of Contents
1. [Lambda Function Configuration](#lambda-function-configuration)
2. [IAM Permissions Setup](#iam-permissions-setup)
3. [S3 Bucket Object Ownership and ACL Configuration](#s3-bucket-object-ownership-and-acl-configuration)
4. [S3 Bucket Policy Configuration](#s3-bucket-policy-configuration)
5. [CORS Policy Configuration](#cors-policy-configuration)
6. [Testing the Upload Functionality](#testing-the-upload-functionality)

## Lambda Function Configuration

First, let's set up our Lambda function to handle file uploads to S3.

### Creating the Lambda Function

1. Navigate to the AWS Lambda console
2. Click "Create function"
3. Choose "Author from scratch"
4. Configure the basic information:
   - Name: `s3-upload-handler`
   - Runtime: Node.js 16.x (or your preferred runtime)
   - Architecture: x86_64 (default)
5. Click "Create function"

### Lambda Function Code

Here's a sample Node.js function that handles file uploads to S3:

```javascript
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async (event) => {
    try {
        // Parse the incoming request
        const contentType = event.headers['content-type'] || event.headers['Content-Type'];
        let body;
        
        if (event.isBase64Encoded) {
            body = Buffer.from(event.body, 'base64');
        } else {
            body = event.body;
        }
        
        // Extract file metadata from query parameters or headers
        const fileName = event.queryStringParameters?.fileName || 'default-filename';
        const fileType = event.queryStringParameters?.fileType || contentType || 'application/octet-stream';
        
        // Set the bucket name
        const bucketName = process.env.S3_BUCKET_NAME;
        
        // Upload parameters
        const params = {
            Bucket: bucketName,
            Key: fileName,
            Body: body,
            ContentType: fileType,
            // Optional: Set ACL if needed and if bucket settings allow
            // ACL: 'public-read',
        };
        
        // Upload to S3
        const uploadResult = await s3.putObject(params).promise();
        
        // Construct the URL to the uploaded object
        const objectUrl = `https://${bucketName}.s3.amazonaws.com/${fileName}`;
        
        // Return success response
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // Configure appropriate CORS
                'Access-Control-Allow-Methods': 'OPTIONS,POST',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
            },
            body: JSON.stringify({
                message: 'File uploaded successfully',
                url: objectUrl,
                etag: uploadResult.ETag
            })
        };
    } catch (error) {
        console.error('Error uploading to S3:', error);
        
        // Return error response
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // Configure appropriate CORS
            },
            body: JSON.stringify({
                message: 'Error uploading file',
                error: error.message
            })
        };
    }
};
```

### Environment Variables

Set the following environment variables in the Lambda configuration:
- Key: `S3_BUCKET_NAME`
- Value: `your-s3-bucket-name`

### Function Configuration

1. Increase the timeout to at least 30 seconds (for larger file uploads)
2. Increase the memory allocation based on expected file sizes (e.g., 512 MB or more)

## IAM Permissions Setup

The Lambda function needs proper IAM permissions to interact with the S3 bucket.

### Creating a Custom IAM Policy

1. Navigate to the IAM console
2. Go to "Policies" and click "Create policy"
3. Use the JSON editor and paste the following policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:PutObjectAcl"
            ],
            "Resource": "arn:aws:s3:::your-s3-bucket-name/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        }
    ]
}
```

4. Replace `your-s3-bucket-name` with your actual bucket name
5. Name the policy (e.g., `s3-upload-lambda-policy`) and create it

### Attaching the Policy to the Lambda Execution Role

1. Go to the Lambda function
2. Select the "Configuration" tab
3. Click on "Permissions"
4. Click on the execution role name to go to the IAM console
5. Click "Attach policies"
6. Search for and select the policy you just created
7. Click "Attach policy"

## S3 Bucket Object Ownership and ACL Configuration

To allow the Lambda function to set ACLs (if needed), you need to configure the bucket's Object Ownership settings.

1. Go to the S3 console
2. Select your bucket
3. Go to the "Permissions" tab
4. Locate "Object Ownership" and click "Edit"
5. Select either:
   - "Bucket owner preferred" (recommended if you want to maintain ACLs but have the bucket owner get full control)
   - "Object writer" (if you want uploaded objects to be owned by the uploader)
6. Save changes

## S3 Bucket Policy Configuration

Configure a bucket policy to define who can access your S3 bucket.

1. Go to the S3 console
2. Select your bucket
3. Go to the "Permissions" tab
4. Click "Bucket policy" and "Edit"
5. Paste the following policy (adjust as needed):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowLambdaUploadAccess",
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::your-account-id:role/your-lambda-execution-role"
            },
            "Action": [
                "s3:PutObject",
                "s3:PutObjectAcl",
                "s3:GetObject"
            ],
            "Resource": [
                "arn:aws:s3:::your-s3-bucket-name/*"
            ]
        },
        {
            "Sid": "PublicReadIfNeeded",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::your-s3-bucket-name/*",
            "Condition": {
                "StringEquals": {
                    "s3:ExistingObjectTag/public": "yes"
                }
            }
        }
    ]
}
```

6. Replace:
   - `your-account-id` with your AWS account ID
   - `your-lambda-execution-role` with the name of your Lambda's execution role
   - `your-s3-bucket-name` with your bucket name
7. Save changes

## CORS Policy Configuration

Configure CORS to allow web applications to upload to your S3 bucket via the Lambda function.

1. Go to the S3 console
2. Select your bucket
3. Go to the "Permissions" tab
4. Scroll down to "Cross-origin resource sharing (CORS)"
5. Click "Edit" and paste the following configuration:

```json
[
    {
        "AllowedHeaders": [
            "Authorization",
            "Content-Type",
            "x-amz-date",
            "x-amz-security-token",
            "content-md5"
        ],
        "AllowedMethods": [
            "PUT",
            "POST",
            "GET",
            "DELETE"
        ],
        "AllowedOrigins": [
            "https://your-frontend-domain.com"
        ],
        "ExposeHeaders": [
            "ETag"
        ],
        "MaxAgeSeconds": 3000
    }
]
```

6. Replace `https://your-frontend-domain.com` with your actual frontend domain or use `*` for testing (not recommended for production)
7. Save changes

## API Gateway Configuration

To expose your Lambda function as an HTTP endpoint:

1. Go to the API Gateway console
2. Click "Create API"
3. Choose "REST API" and click "Build"
4. Name your API (e.g., "S3UploadAPI") and click "Create API"
5. Click "Actions" > "Create Resource"
6. Name it (e.g., "upload") and click "Create Resource"
7. Click "Actions" > "Create Method"
8. Select "POST" and click the checkmark
9. Configure the method:
   - Integration type: Lambda Function
   - Lambda Function: Select your Lambda function
   - Click "Save"
10. Add support for binary data:
    - Go to your API settings
    - Scroll down to "Binary Media Types"
    - Add the following media types:
      - `*/*` (for all binary types)
      - `image/*` (for images)
      - `application/octet-stream`
11. Configure CORS for the API Gateway:
    - Click "Actions" > "Enable CORS"
    - Configure as needed and click "Enable CORS and replace existing CORS headers"
12. Deploy the API:
    - Click "Actions" > "Deploy API"
    - Create a new stage (e.g., "prod")
    - Click "Deploy"

## Testing the Upload Functionality

### Using cURL

```bash
curl -X POST \
  https://your-api-gateway-id.execute-api.your-region.amazonaws.com/prod/upload?fileName=test-image.jpg \
  -H 'Content-Type: image/jpeg' \
  --data-binary '@/path/to/your/image.jpg'
```

### Using a Web Application

```javascript
async function uploadFile(file) {
    const fileName = encodeURIComponent(file.name);
    const fileType = file.type;
    
    const response = await fetch(
        `https://your-api-gateway-id.execute-api.your-region.amazonaws.com/prod/upload?fileName=${fileName}&fileType=${fileType}`,
        {
            method: 'POST',
            body: file,
            headers: {
                'Content-Type': fileType
            }
        }
    );
    
    return await response.json();
}

// Usage
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    try {
        const result = await uploadFile(file);
        console.log('Upload successful:', result.url);
    } catch (error) {
        console.error('Upload failed:', error);
    }
});
```

## Troubleshooting

### Common Issues and Solutions

1. **403 Forbidden Errors**
   - Verify IAM permissions for the Lambda execution role
   - Check the S3 bucket policy
   - Ensure Object Ownership settings are correctly configured

2. **Binary Data Not Working**
   - Make sure API Gateway has binary media types configured
   - Verify the Lambda function correctly handles base64-encoded data

3. **CORS Issues**
   - Double-check CORS settings in both S3 and API Gateway
   - Ensure all required headers are allowed

4. **Timeout Errors**
   - Increase the Lambda timeout setting
   - For large files, consider direct S3 upload with pre-signed URLs instead

5. **Missing Files**
   - Check CloudWatch logs for your Lambda function
   - Verify the bucket name in environment variables

## Security Considerations

1. **Access Control**
   - Implement authentication for your API endpoint
   - Consider using API keys or AWS Cognito

2. **File Size Limits**
   - Set appropriate file size limits
   - Consider chunked uploads for large files

3. **Content Validation**
   - Validate file types and content before storage
   - Implement virus scanning for uploaded files

4. **Encryption**
   - Enable server-side encryption for your S3 bucket
   - Use HTTPS for all API communications
