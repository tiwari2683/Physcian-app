/**
 * Patch script: Add ANY method to /patient-data resource
 * and re-deploy API Gateway.
 */
const {
    APIGatewayClient,
    GetRestApisCommand,
    GetResourcesCommand,
    PutMethodCommand,
    PutIntegrationCommand,
    CreateDeploymentCommand
} = require("@aws-sdk/client-api-gateway");
const { LambdaClient, AddPermissionCommand, GetFunctionCommand } = require("@aws-sdk/client-lambda");
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

async function main() {
    try {
        // 1. Find existing API
        console.log(`🔍 Finding API: ${API_NAME}...`);
        const apis = await gatewayClient.send(new GetRestApisCommand({}));
        const api = apis.items.find(a => a.name === API_NAME);
        if (!api) {
            console.error("❌ API not found!");
            return;
        }
        const apiId = api.id;
        console.log(`✅ Found API: ${apiId}`);

        // 2. Find /patient-data resource
        const resources = await gatewayClient.send(new GetResourcesCommand({ restApiId: apiId }));
        const patientDataResource = resources.items.find(r => r.path === "/patient-data");
        if (!patientDataResource) {
            console.error("❌ /patient-data resource not found!");
            return;
        }
        const resourceId = patientDataResource.id;
        console.log(`✅ Found /patient-data resource: ${resourceId}`);
        console.log(`   Existing methods: ${Object.keys(patientDataResource.resourceMethods || {}).join(', ')}`);

        // 3. Get Lambda ARN for patientDataFunction
        const funcData = await lambdaClient.send(new GetFunctionCommand({ FunctionName: "patientDataFunction" }));
        const lambdaArn = funcData.Configuration.FunctionArn;
        const region = lambdaArn.split(':')[3];
        const accountId = lambdaArn.split(':')[4];
        console.log(`✅ Lambda ARN: ${lambdaArn}`);

        // 4. Add ANY method (this will catch GET and all other methods)
        console.log(`   Adding ANY method to /patient-data...`);
        try {
            await gatewayClient.send(new PutMethodCommand({
                restApiId: apiId,
                resourceId: resourceId,
                httpMethod: "ANY",
                authorizationType: "NONE"
            }));
            console.log(`   ✅ ANY method created`);
        } catch (e) {
            if (e.name === 'ConflictException') {
                console.log(`   ⚠️ ANY method already exists, updating integration...`);
            } else {
                throw e;
            }
        }

        // 5. Set up Lambda Proxy integration for ANY
        const integrationUri = `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`;
        await gatewayClient.send(new PutIntegrationCommand({
            restApiId: apiId,
            resourceId: resourceId,
            httpMethod: "ANY",
            type: "AWS_PROXY",
            integrationHttpMethod: "POST",
            uri: integrationUri
        }));
        console.log(`   ✅ ANY integration configured`);

        // 6. Grant permission to API Gateway
        const statementId = `apigateway-any-${apiId}-patientData`;
        try {
            await lambdaClient.send(new AddPermissionCommand({
                FunctionName: "patientDataFunction",
                StatementId: statementId,
                Action: "lambda:InvokeFunction",
                Principal: "apigateway.amazonaws.com",
                SourceArn: `arn:aws:execute-api:${region}:${accountId}:${apiId}/*/*/*`
            }));
            console.log(`   ✅ Lambda permission added`);
        } catch (e) {
            if (e.name === 'ResourceConflictException') {
                console.log(`   ✅ Permission already exists`);
            } else {
                console.warn(`   ⚠️ Permission warning: ${e.message}`);
            }
        }

        // 7. Also fix /appointments - ensure it has proper permissions
        const appointmentsResource = resources.items.find(r => r.path === "/appointments");
        if (appointmentsResource) {
            console.log(`\n🔧 Also checking /appointments (${appointmentsResource.id})...`);
            console.log(`   Existing methods: ${Object.keys(appointmentsResource.resourceMethods || {}).join(', ')}`);

            // Ensure Lambda permission for appointments too
            try {
                const appFunc = await lambdaClient.send(new GetFunctionCommand({ FunctionName: "appointmentsFunction" }));
                const appLambdaArn = appFunc.Configuration.FunctionArn;

                // Check if GET is needed (the dashboard fetches appointments via GET)
                try {
                    await gatewayClient.send(new PutMethodCommand({
                        restApiId: apiId,
                        resourceId: appointmentsResource.id,
                        httpMethod: "GET",
                        authorizationType: "NONE"
                    }));
                    console.log(`   ✅ GET method added to /appointments`);

                    const appIntegrationUri = `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${appLambdaArn}/invocations`;
                    await gatewayClient.send(new PutIntegrationCommand({
                        restApiId: apiId,
                        resourceId: appointmentsResource.id,
                        httpMethod: "GET",
                        type: "AWS_PROXY",
                        integrationHttpMethod: "POST",
                        uri: appIntegrationUri
                    }));
                    console.log(`   ✅ GET integration configured for /appointments`);
                } catch (e) {
                    if (e.name === 'ConflictException') {
                        console.log(`   ✅ GET method already exists on /appointments`);
                    } else {
                        console.warn(`   ⚠️ Could not add GET: ${e.message}`);
                    }
                }
            } catch (e) {
                console.warn(`   ⚠️ appointments function check: ${e.message}`);
            }
        }

        // 8. Re-deploy
        console.log(`\n🚀 Re-deploying API to '${STAGE_NAME}' stage...`);
        await gatewayClient.send(new CreateDeploymentCommand({
            restApiId: apiId,
            stageName: STAGE_NAME,
            description: "Patched: Added ANY method to /patient-data"
        }));

        const apiUrl = `https://${apiId}.execute-api.${REGION}.amazonaws.com/${STAGE_NAME}`;
        console.log(`\n✅ Patch Complete!`);
        console.log(`👉 API URL: ${apiUrl}`);
        console.log(`   - Patient Data (ANY): ${apiUrl}/patient-data`);
        console.log(`   - Appointments (ANY/GET): ${apiUrl}/appointments`);

    } catch (error) {
        console.error("❌ Patch failed:", error);
    }
}

main();
