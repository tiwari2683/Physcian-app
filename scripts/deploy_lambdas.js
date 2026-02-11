const { LambdaClient, CreateFunctionCommand, GetFunctionCommand, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand } = require("@aws-sdk/client-lambda");
const { IAMClient, CreateRoleCommand, GetRoleCommand, AttachRolePolicyCommand } = require("@aws-sdk/client-iam");
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const dotenv = require('dotenv');

// Load environment variables manually if dotenv is not working for some reason, 
// but we'll try to rely on the process.env if set, or load from file.
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const REGION = process.env.AWS_REGION || "us-east-2";
const ACCOUNT_ID = process.env.AWS_ACCESS_KEY_ID ? "CURRENT_ACCOUNT" : "UNKNOWN";

// Configuration
const LAMBDA_ROLE_NAME = "PhysicianAppLambdaRole";
const APPOINTMENTS_FUNC_NAME = "appointmentsFunction";
const PATIENT_DATA_FUNC_NAME = "patientDataFunction";

const lambdaClient = new LambdaClient({
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const iamClient = new IAMClient({
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function getOrCreateRole() {
    console.log(`🔍 Checking for IAM Role: ${LAMBDA_ROLE_NAME}...`);
    try {
        const getRole = new GetRoleCommand({ RoleName: LAMBDA_ROLE_NAME });
        const data = await iamClient.send(getRole);
        console.log(`✅ Role found: ${data.Role.Arn}`);
        return data.Role.Arn;
    } catch (err) {
        // AWS SDK v3 often returns 'NoSuchEntity' as name or Code
        if (err.name === 'NoSuchEntityException' || err.name === 'NoSuchEntity' || err.Code === 'NoSuchEntity') {
            console.log(`⚠️ Role not found. Creating ${LAMBDA_ROLE_NAME}...`);
            const assumeRolePolicy = {
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: { Service: "lambda.amazonaws.com" },
                    Action: "sts:AssumeRole"
                }]
            };

            const createRole = new CreateRoleCommand({
                RoleName: LAMBDA_ROLE_NAME,
                AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy)
            });

            const data = await iamClient.send(createRole);
            console.log(`✅ Role created: ${data.Role.Arn}`);

            // Attach Policies (DynamoDB, S3, CloudWatch)
            const policies = [
                "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
                "arn:aws:iam::aws:policy/AmazonS3FullAccess",
                "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
            ];

            for (const policyArn of policies) {
                await iamClient.send(new AttachRolePolicyCommand({
                    RoleName: LAMBDA_ROLE_NAME,
                    PolicyArn: policyArn
                }));
                console.log(`   + Attached policy: ${policyArn.split('/').pop()}`);
            }

            console.log("⏳ Waiting 10 seconds for role propagation...");
            await new Promise(resolve => setTimeout(resolve, 10000));
            return data.Role.Arn;
        }
        throw err;
    }
}

function zipDirectory(source, out) {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);

    return new Promise((resolve, reject) => {
        archive
            .directory(source, false)
            .on('error', err => reject(err))
            .pipe(stream);

        stream.on('close', () => resolve());
        archive.finalize();
    });
}

function zipFile(sourceFile, out, targetName = 'index.js') {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);

    return new Promise((resolve, reject) => {
        archive
            .file(sourceFile, { name: targetName })
            .on('error', err => reject(err))
            .pipe(stream);

        stream.on('close', () => resolve());
        archive.finalize();
    });
}

async function deployFunction(funcName, zipPath, roleArn, handlerName = "index.handler") {
    console.log(`🚀 Deploying ${funcName}...`);
    const fileContent = fs.readFileSync(zipPath);

    try {
        await lambdaClient.send(new GetFunctionCommand({ FunctionName: funcName }));
        // Update existing
        console.log(`   Function exists. Updating code...`);
        await lambdaClient.send(new UpdateFunctionCodeCommand({
            FunctionName: funcName,
            ZipFile: fileContent
        }));
        // Optionally update config if needed
        await lambdaClient.send(new UpdateFunctionConfigurationCommand({
            FunctionName: funcName,
            Timeout: 30,
            Handler: handlerName,
            Role: roleArn,
            Runtime: "nodejs20.x"
        }));
        console.log(`✅ ${funcName} updated successfully.`);
    } catch (err) {
        console.log(`DEBUG: Error checking ${funcName}: Name='${err.name}', Code='${err.Code}', Message='${err.message}'`);

        if (err.name === 'ResourceNotFoundException' ||
            err.name === 'ResourceNotFound' ||
            err.Code === 'ResourceNotFoundException' ||
            (err.message && err.message.includes('ResourceNotFoundException'))
        ) {
            // Create new
            console.log(`   Function does not exist. Creating...`);
            await lambdaClient.send(new CreateFunctionCommand({
                FunctionName: funcName,
                Runtime: "nodejs20.x",
                Role: roleArn,
                Handler: handlerName,
                Code: { ZipFile: fileContent },
                Timeout: 30
            }));
            console.log(`✅ ${funcName} created successfully.`);
        } else {
            console.error(`❌ Error deploying ${funcName}:`, err);
        }
    }
}

async function main() {
    try {
        // 0. Ensure deps
        if (!process.env.AWS_ACCESS_KEY_ID) {
            console.error("❌ CRITICAL: No credentials found. Check .env file.");
            return;
        }

        // 1. Get Role
        const roleArn = await getOrCreateRole();

        // 2. Prepare Zip for Appointments Function
        // It seems appointmentsFunction.js expects to be a single file handler.
        // But it relies on @aws-sdk. AWS Lambda Node 18/20 provides SDK v3 built-in usually, 
        // BUT it's safer to bundle deps if we used external ones. 
        // For simplicity, we assume the environment provides SDK or we upload node_modules (too large).
        // Let's rely on standard runtime SDK for now + simple file.
        // Actually, appointmentsFunction requires @aws-sdk/lib-dynamodb which might not be in standard runtime?
        // Node 18 runtime includes SDK v3.

        console.log("📦 Zipping code...");

        // Zipping appointmentsFunction
        // The file is at: lambda/appointmentsFunction.js
        // We will rename it to index.js in the zip for simplicity if we set handler to index.handler
        const appointmentsZip = path.join(__dirname, 'appointments.zip');
        await zipFile(path.join(__dirname, '..', 'lambda', 'appointmentsFunction.js'), appointmentsZip, "index.js");

        // Zipping patientDataFunction (lambdaForCreateAsWellAsUpdate.js)
        const patientDataZip = path.join(__dirname, 'patientData.zip');
        await zipFile(path.join(__dirname, '..', 'lambdaForCreateAsWellAsUpdate.js'), patientDataZip, "index.mjs");

        // 3. Deploy
        await deployFunction(APPOINTMENTS_FUNC_NAME, appointmentsZip, roleArn, "index.handler");
        await deployFunction(PATIENT_DATA_FUNC_NAME, patientDataZip, roleArn, "index.handler");

        // Cleanup
        fs.unlinkSync(appointmentsZip);
        fs.unlinkSync(patientDataZip);

        console.log("\n🎉 All Lambdas Deployed Successfully!");
        console.log("👉 Next Step: Run 'node scripts/setup_api_gateway.js' (Coming soon)");

    } catch (error) {
        console.error("❌ Deployment failed:", error);
    }
}

main();
