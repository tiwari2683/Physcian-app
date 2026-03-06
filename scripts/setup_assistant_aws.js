/**
 * AWS Setup Script for Physician Assistant Panel
 * 
 * This script automates the creation of:
 * 1. The Cognito App Client (AssistantPanelClient)
 * 2. The 'Assistants' User Group in Cognito
 * 3. The CORS configuration for the S3 Bucket to allow web uploads
 * 
 * Usage: node scripts/setup_assistant_aws.js
 */

const {
    CognitoIdentityProviderClient,
    ListUserPoolsCommand,
    CreateUserPoolClientCommand,
    CreateGroupCommand,
    GetGroupCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const {
    S3Client,
    PutBucketCorsCommand
} = require("@aws-sdk/client-s3");

const fs = require("fs");
const path = require("path");

// Manual .env parser
try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^['"]|['"]$/g, '');
                process.env[key] = value;
            }
        });
    }
} catch (error) {
    console.warn("Error reading .env file:", error.message);
}

const REGION = "us-east-2";
const POOL_NAME = "PhysicianAppUserPool";
const S3_BUCKET_NAME = "dr-gawli-patient-files-use2-5694"; // From previous configuration

const clientConfig = {
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
};

const cognitoClient = new CognitoIdentityProviderClient(clientConfig);
const s3Client = new S3Client(clientConfig);

async function main() {
    console.log("🚀 Starting Assistant Panel AWS Setup...\n");

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        console.error("❌ CRITICAL ERROR: AWS Credentials NOT found in environment variables.");
        process.exit(1);
    }

    try {
        // 1. Find the User Pool
        console.log("🔍 Locating User Pool...");
        const listResult = await cognitoClient.send(new ListUserPoolsCommand({ MaxResults: 60 }));
        const existingPool = listResult.UserPools?.find(p => p.Name === POOL_NAME);

        if (!existingPool) {
            console.error(`❌ User Pool '${POOL_NAME}' not found! Please run setup_cognito.js first.`);
            process.exit(1);
        }

        const userPoolId = existingPool.Id;
        console.log(`✅ Found User Pool: ${userPoolId}`);

        // 2. Create the App Client for the Web Panel
        console.log("\n📱 Creating App Client (AssistantPanelClient)...");
        const createClientResult = await cognitoClient.send(new CreateUserPoolClientCommand({
            UserPoolId: userPoolId,
            ClientName: "AssistantPanelClient",
            GenerateSecret: false, // Critical for Web/SPA
            ExplicitAuthFlows: [
                "ALLOW_USER_SRP_AUTH",
                "ALLOW_REFRESH_TOKEN_AUTH",
                "ALLOW_USER_PASSWORD_AUTH",
            ],
            PreventUserExistenceErrors: "ENABLED",
        }));
        const clientId = createClientResult.UserPoolClient.ClientId;
        console.log(`✅ App Client created: ${clientId}`);

        // 3. Create the 'Assistants' User Group
        console.log("\n👥 Creating 'Assistants' User Group...");
        try {
            await cognitoClient.send(new GetGroupCommand({
                GroupName: "Assistants",
                UserPoolId: userPoolId
            }));
            console.log("✅ Group 'Assistants' already exists.");
        } catch (error) {
            if (error.name === 'ResourceNotFoundException') {
                await cognitoClient.send(new CreateGroupCommand({
                    GroupName: "Assistants",
                    UserPoolId: userPoolId,
                    Description: "Group for Physician Assistants to enforce role restrictions."
                }));
                console.log("✅ Group 'Assistants' created successfully.");
            } else {
                throw error;
            }
        }

        // 4. Configure S3 CORS for Web Uploads
        console.log(`\n🪣 Configuring CORS for S3 Bucket: ${S3_BUCKET_NAME}...`);
        try {
            await s3Client.send(new PutBucketCorsCommand({
                Bucket: S3_BUCKET_NAME,
                CORSConfiguration: {
                    CORSRules: [
                        {
                            AllowedHeaders: ["*"],
                            AllowedMethods: ["GET", "PUT", "POST", "HEAD"],
                            AllowedOrigins: ["http://localhost:5173", "https://*"], // Local dev & production
                            ExposeHeaders: ["ETag"],
                            MaxAgeSeconds: 3000
                        }
                    ]
                }
            }));
            console.log("✅ S3 CORS configuration applied successfully.");
        } catch (s3Error) {
            console.log(`⚠️ Note on S3: Could not auto-configure CORS. Ensure bucket ${S3_BUCKET_NAME} exists. Error: ${s3Error.message}`);
        }

        console.log("\n========================================");
        console.log("🎉 ASSISTANT AWS SETUP COMPLETE!");
        console.log("========================================\n");
        console.log("Copy this Client ID to your Assistant Panel config:");
        console.log(`➡️  userPoolClientId: "${clientId}"`);
        console.log("\nFile to update:");
        console.log("   assistant-panel/src/config/index.ts  (Line ~15)");
        console.log("\n⚠️ FINAL MANUAL STEP:");
        console.log("   You still need to enable CORS in API Gateway for `/patient-data` and `/appointments`");
        console.log("   so the browser allows cross-origin requests.");
        console.log("========================================");

    } catch (err) {
        console.error("❌ Setup Failed:", err);
        process.exit(1);
    }
}

main();
