/**
 * Cognito User Pool Setup Script
 * Creates a User Pool + App Client in us-east-2 for the Physician App.
 * 
 * Usage: node scripts/setup_cognito.js
 * 
 * Prerequisites:
 *   - .env file with AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
 *   - npm install @aws-sdk/client-cognito-identity-provider
 */

const {
    CognitoIdentityProviderClient,
    CreateUserPoolCommand,
    CreateUserPoolClientCommand,
    DescribeUserPoolCommand,
    ListUserPoolsCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

// Load environment variables
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const key in envConfig) {
        process.env[key] = envConfig[key];
    }
}

const REGION = "us-east-2";
const POOL_NAME = "PhysicianAppUserPool";

const client = new CognitoIdentityProviderClient({
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

async function main() {
    console.log("🔐 Cognito User Pool Setup");
    console.log("========================\n");

    // 1. Check if pool already exists
    console.log("🔍 Checking for existing User Pool...");
    const listResult = await client.send(new ListUserPoolsCommand({ MaxResults: 60 }));
    const existing = listResult.UserPools?.find(p => p.Name === POOL_NAME);

    if (existing) {
        console.log(`✅ User Pool already exists: ${existing.Id}`);
        const desc = await client.send(new DescribeUserPoolCommand({ UserPoolId: existing.Id }));
        console.log(`   Name: ${desc.UserPool.Name}`);
        console.log(`   ID: ${desc.UserPool.Id}`);
        console.log(`   Status: ${desc.UserPool.Status}`);
        console.log("\n⚠️  Pool already exists. To recreate, delete it first in the AWS Console.");
        console.log("   Skipping to App Client check...\n");

        await ensureAppClient(existing.Id);
        return;
    }

    // 2. Create User Pool
    console.log("📦 Creating User Pool...");
    const createPoolResult = await client.send(new CreateUserPoolCommand({
        PoolName: POOL_NAME,

        // Sign-in configuration: allow email as username
        UsernameAttributes: ["email"],
        AutoVerifiedAttributes: ["email"],

        // Verification
        VerificationMessageTemplate: {
            DefaultEmailOption: "CONFIRM_WITH_CODE",
            EmailSubject: "Physician App - Verification Code",
            EmailMessage: "Your verification code is {####}. Please use this to verify your account.",
        },

        // Password policy
        Policies: {
            PasswordPolicy: {
                MinimumLength: 8,
                RequireUppercase: true,
                RequireLowercase: true,
                RequireNumbers: true,
                RequireSymbols: false,
                TemporaryPasswordValidityDays: 7,
            },
        },

        // Required attributes
        Schema: [
            {
                Name: "email",
                AttributeDataType: "String",
                Required: true,
                Mutable: true,
            },
            {
                Name: "name",
                AttributeDataType: "String",
                Required: true,
                Mutable: true,
            },
            {
                Name: "phone_number",
                AttributeDataType: "String",
                Required: false,
                Mutable: true,
            },
        ],

        // Account recovery
        AccountRecoverySetting: {
            RecoveryMechanisms: [
                { Name: "verified_email", Priority: 1 },
            ],
        },

        // MFA off (matching old pool behavior for simplicity)
        MfaConfiguration: "OFF",

        // Email configuration (use Cognito default email sender)
        EmailConfiguration: {
            EmailSendingAccount: "COGNITO_DEFAULT",
        },

        // User pool add-ons
        UserPoolAddOns: {
            AdvancedSecurityMode: "OFF",
        },
    }));

    const userPoolId = createPoolResult.UserPool.Id;
    console.log(`✅ User Pool created: ${userPoolId}\n`);

    // 3. Create App Client
    await ensureAppClient(userPoolId);
}

async function ensureAppClient(userPoolId) {
    console.log("📱 Creating App Client...");

    const createClientResult = await client.send(new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "PhysicianAppClient",

        // No client secret (required for mobile/SPA apps)
        GenerateSecret: false,

        // Auth flows
        ExplicitAuthFlows: [
            "ALLOW_USER_SRP_AUTH",
            "ALLOW_REFRESH_TOKEN_AUTH",
            "ALLOW_USER_PASSWORD_AUTH",
            "ALLOW_CUSTOM_AUTH",
        ],

        // Token validity
        AccessTokenValidity: 1,    // 1 hour
        IdTokenValidity: 1,        // 1 hour
        RefreshTokenValidity: 30,  // 30 days
        TokenValidityUnits: {
            AccessToken: "hours",
            IdToken: "hours",
            RefreshToken: "days",
        },

        // Prevent user existence errors (security)
        PreventUserExistenceErrors: "ENABLED",

        // Read/write attributes
        ReadAttributes: [
            "email",
            "name",
            "phone_number",
            "email_verified",
            "given_name",
            "family_name",
        ],
        WriteAttributes: [
            "email",
            "name",
            "phone_number",
            "given_name",
            "family_name",
        ],
    }));

    const clientId = createClientResult.UserPoolClient.ClientId;
    console.log(`✅ App Client created: ${clientId}\n`);

    // 4. Print summary
    console.log("========================================");
    console.log("🎉 COGNITO SETUP COMPLETE!");
    console.log("========================================\n");
    console.log("Copy these values to your config files:\n");
    console.log(`   userPoolId:       ${userPoolId}`);
    console.log(`   userPoolClientId: ${clientId}`);
    console.log(`   region:           ${REGION}`);
    console.log("");
    console.log("Files to update:");
    console.log("   1. aws-exports.js  (lines 3-22)");
    console.log("   2. Components/Auth/SignInScreen.tsx  (lines 51-74)");
    console.log("");
    console.log("⚠️  Google OAuth is NOT configured. Add it later via AWS Console if needed.");
    console.log("========================================\n");
}

main().catch(err => {
    console.error("❌ Error:", err.message);
    process.exit(1);
});
