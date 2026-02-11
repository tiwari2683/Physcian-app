const {
    APIGatewayClient,
    CreateRestApiCommand,
    GetResourcesCommand,
    CreateResourceCommand,
    PutMethodCommand,
    PutIntegrationCommand,
    PutMethodResponseCommand,
    PutIntegrationResponseCommand,
    CreateDeploymentCommand,
    GetRestApisCommand
} = require("@aws-sdk/client-api-gateway");
const { LambdaClient, AddPermissionCommand } = require("@aws-sdk/client-lambda");
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const REGION = process.env.AWS_REGION || "us-east-2";
const ACCOUNT_ID = process.env.AWS_ACCESS_KEY_ID ? "CURRENT_ACCOUNT" : "UNKNOWN";

const config = {
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
};

const gatewayClient = new APIGatewayClient(config);
const lambdaClient = new LambdaClient(config);

const API_NAME = "PhysicianAppAPI";
const STAGE_NAME = "prod";

async function getOrCreateApi() {
    console.log(`🔍 Checking for API Gateway: ${API_NAME}...`);
    const apis = await gatewayClient.send(new GetRestApisCommand({}));
    const existing = apis.items.find(api => api.name === API_NAME);

    if (existing) {
        console.log(`✅ Found existing API: ${existing.id}`);
        return existing.id;
    }

    console.log(`   Creating new API...`);
    const newApi = await gatewayClient.send(new CreateRestApiCommand({
        name: API_NAME,
        description: "API for Physician App Backend"
    }));
    console.log(`✅ API Created: ${newApi.id}`);
    return newApi.id;
}

async function getRootResource(apiId) {
    const resources = await gatewayClient.send(new GetResourcesCommand({ restApiId: apiId }));
    return resources.items.find(r => r.path === "/");
}

async function createResource(apiId, parentId, pathPart) {
    // Check if exists first
    const resources = await gatewayClient.send(new GetResourcesCommand({ restApiId: apiId }));
    const existing = resources.items.find(r => r.pathPart === pathPart && r.parentId === parentId); // Approximation
    // A better check is finding by path, but we construct it.
    // Let's just look at items and see if one matches parent and pathPart.

    if (existing) {
        console.log(`   Resource /${pathPart} already exists: ${existing.id}`);
        return existing.id;
    }

    console.log(`   Creating resource /${pathPart}...`);
    const resource = await gatewayClient.send(new CreateResourceCommand({
        restApiId: apiId,
        parentId: parentId,
        pathPart: pathPart
    }));
    return resource.id;
}

async function enableCors(apiId, resourceId) {
    console.log(`      Configuring CORS for resource...`);

    // 1. Create OPTIONS method
    try {
        await gatewayClient.send(new PutMethodCommand({
            restApiId: apiId,
            resourceId: resourceId,
            httpMethod: "OPTIONS",
            authorizationType: "NONE"
        }));
    } catch (e) { /* Ignore if exists */ }

    // 2. Mock Integration
    await gatewayClient.send(new PutIntegrationCommand({
        restApiId: apiId,
        resourceId: resourceId,
        httpMethod: "OPTIONS",
        type: "MOCK",
        requestTemplates: { "application/json": "{\"statusCode\": 200}" }
    }));

    // 3. Method Response
    await gatewayClient.send(new PutMethodResponseCommand({
        restApiId: apiId,
        resourceId: resourceId,
        httpMethod: "OPTIONS",
        statusCode: "200",
        responseParameters: {
            "method.response.header.Access-Control-Allow-Headers": true,
            "method.response.header.Access-Control-Allow-Methods": true,
            "method.response.header.Access-Control-Allow-Origin": true
        },
        responseModels: { "application/json": "Empty" }
    }));

    // 4. Integration Response
    await gatewayClient.send(new PutIntegrationResponseCommand({
        restApiId: apiId,
        resourceId: resourceId,
        httpMethod: "OPTIONS",
        statusCode: "200",
        responseParameters: {
            "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
            "method.response.header.Access-Control-Allow-Methods": "'OPTIONS,GET,POST,PUT,DELETE,PATCH'",
            "method.response.header.Access-Control-Allow-Origin": "'*'"
        },
        responseTemplates: { "application/json": "" }
    }));
}

async function createLambdaIntegration(apiId, resourceId, httpMethod, functionName) {
    console.log(`   Linking ${httpMethod} to ${functionName}...`);

    // 0. Get Account ID (needed for ARN construction mostly, but we can query lambda for ARN)
    // Actually we need the Lambda ARN.
    // Let's assume we can construct it or fetch it.
    // Fetching is safer.
    // But we need the Invoke ARN for API Gateway.
    // Format: arn:aws:apigateway:{region}:lambda:path/2015-03-31/functions/{lambdaArn}/invocations

    const { GetFunctionCommand } = require("@aws-sdk/client-lambda");
    const funcData = await lambdaClient.send(new GetFunctionCommand({ FunctionName: functionName }));
    const lambdaArn = funcData.Configuration.FunctionArn;
    const region = lambdaArn.split(':')[3];
    const accountId = lambdaArn.split(':')[4]; // Better than env var

    // 1. Put Method
    try {
        await gatewayClient.send(new PutMethodCommand({
            restApiId: apiId,
            resourceId: resourceId,
            httpMethod: httpMethod,
            authorizationType: "NONE" // Public for now, or use IAM/Cognito if needed
        }));
    } catch (e) { /* Update? */ }

    // 2. Put Integration
    const integrationUri = `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`;

    await gatewayClient.send(new PutIntegrationCommand({
        restApiId: apiId,
        resourceId: resourceId,
        httpMethod: httpMethod,
        type: "AWS_PROXY",
        integrationHttpMethod: "POST", // Lambda is always called via POST
        uri: integrationUri
    }));

    // 3. Add Method Response (mostly for Proxy, but good practice to explicitly allow CORS headers if not using proxy properly, 
    // but with AWS_PROXY, Lambda handles headers. However, OPTIONS mock above handles preflight.)

    // 4. Grant Permission to API Gateway to invoke Lambda
    // This is often the missed step.
    const statementId = `apigateway-invoke-${apiId}-${randomString(6)}`;
    try {
        await lambdaClient.send(new AddPermissionCommand({
            FunctionName: functionName,
            StatementId: statementId,
            Action: "lambda:InvokeFunction",
            Principal: "apigateway.amazonaws.com",
            SourceArn: `arn:aws:execute-api:${region}:${accountId}:${apiId}/*/${httpMethod}/*`
            // Wildcard path is safer: arn:aws:execute-api:region:account-id:api-id/*/*/*
        }));
        console.log(`      Added Lambda permission for API Gateway.`);
    } catch (e) {
        if (e.name === 'ResourceConflictException') {
            console.log(`      Permission already exists.`);
        } else {
            console.warn(`      ⚠️  Could not add permission: ${e.message}`);
        }
    }
}

function randomString(length) {
    return Math.random().toString(36).substring(2, 2 + length);
}

async function main() {
    try {
        if (!process.env.AWS_ACCESS_KEY_ID) {
            console.error("❌ CRITICAL: No credentials found. Check .env file.");
            return;
        }

        // 1. Get API
        const apiId = await getOrCreateApi();

        // 2. Get Root
        const root = await getRootResource(apiId);

        // 3. Setup /appointments
        const appsResId = await createResource(apiId, root.id, "appointments");
        await enableCors(apiId, appsResId);
        await createLambdaIntegration(apiId, appsResId, "ANY", "appointmentsFunction");

        // 4. Setup /patient-data
        const patientDataResId = await createResource(apiId, root.id, "patient-data");
        await enableCors(apiId, patientDataResId);
        await createLambdaIntegration(apiId, patientDataResId, "ANY", "patientDataFunction"); // Supports POST, GET and other methods

        // 5. Deploy
        console.log(`🚀 Deploying API to stage '${STAGE_NAME}'...`);
        await gatewayClient.send(new CreateDeploymentCommand({
            restApiId: apiId,
            stageName: STAGE_NAME
        }));

        const apiUrl = `https://${apiId}.execute-api.${REGION}.amazonaws.com/${STAGE_NAME}`;
        console.log(`\n✅ API Gateway Setup Complete!`);
        console.log(`👉 Base URL: ${apiUrl}`);
        console.log(`   - Appointments: ${apiUrl}/appointments`);
        console.log(`   - Patient Data: ${apiUrl}/patient-data`);

        console.log(`\n⚠️  IMPORTANT: Updating aws-exports.js is recommended.`);

    } catch (error) {
        console.error("❌ Setup failed:", error);
    }
}

main();
