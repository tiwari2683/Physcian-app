const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, CreateBucketCommand, PutBucketCorsCommand, ListBucketsCommand } = require("@aws-sdk/client-s3");
const fs = require('fs');
const path = require('path');

// Manual .env parser to avoid adding dependencies
try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        console.log("Found .env file, loading credentials...");
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^['"]|['"]$/g, ''); // Remove quotes if present
                process.env[key] = value;
            }
        });
    } else {
        console.log("No .env file found. Expecting AWS credentials in environment variables.");
    }
} catch (error) {
    console.warn("Error reading .env file:", error.message);
}

const REGION = "us-east-2"; // Target Region

// DEBUG: Check if credentials were actually loaded
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error("❌ CRITICAL ERROR: Credentials NOT found in environment variables.");
    console.error("   Make sure your .env file is saved and has AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
    // Fallback attempt to print what we did find (safely)
    console.log("   Current Enum Keys:", Object.keys(process.env).filter(k => k.startsWith('AWS_')));
} else {
    console.log(`🔑 Credentials loaded! Access Key ID starts with: ${process.env.AWS_ACCESS_KEY_ID.substring(0, 4)}...`);
}

const clientConfig = {
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
};

const client = new DynamoDBClient(clientConfig);
const s3Client = new S3Client(clientConfig);

const TABLES = [
    {
        TableName: "Appointments",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST"
    },
    {
        TableName: "Patients",
        KeySchema: [{ AttributeName: "patientId", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "patientId", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST"
    },
    {
        TableName: "ClinicalParametersHistory",
        KeySchema: [
            { AttributeName: "patientId", KeyType: "HASH" },
            { AttributeName: "timestamp", KeyType: "RANGE" }
        ],
        AttributeDefinitions: [
            { AttributeName: "patientId", AttributeType: "S" },
            { AttributeName: "timestamp", AttributeType: "S" }
        ],
        BillingMode: "PAY_PER_REQUEST"
    },
    {
        TableName: "MedicalHistoryEntries",
        KeySchema: [
            { AttributeName: "patientId", KeyType: "HASH" },
            { AttributeName: "timestamp", KeyType: "RANGE" }
        ],
        AttributeDefinitions: [
            { AttributeName: "patientId", AttributeType: "S" },
            { AttributeName: "timestamp", AttributeType: "S" }
        ],
        BillingMode: "PAY_PER_REQUEST"
    },
    {
        TableName: "DiagnosisHistoryEntries",
        KeySchema: [
            { AttributeName: "patientId", KeyType: "HASH" },
            { AttributeName: "timestamp", KeyType: "RANGE" }
        ],
        AttributeDefinitions: [
            { AttributeName: "patientId", AttributeType: "S" },
            { AttributeName: "timestamp", AttributeType: "S" }
        ],
        BillingMode: "PAY_PER_REQUEST"
    },
    {
        TableName: "InvestigationsHistoryEntries",
        KeySchema: [
            { AttributeName: "patientId", KeyType: "HASH" },
            { AttributeName: "timestamp", KeyType: "RANGE" }
        ],
        AttributeDefinitions: [
            { AttributeName: "patientId", AttributeType: "S" },
            { AttributeName: "timestamp", AttributeType: "S" }
        ],
        BillingMode: "PAY_PER_REQUEST"
    },
    {
        TableName: "Medicines",
        KeySchema: [
            { AttributeName: "PK", KeyType: "HASH" },
            { AttributeName: "SK", KeyType: "RANGE" }
        ],
        AttributeDefinitions: [
            { AttributeName: "PK", AttributeType: "S" },
            { AttributeName: "SK", AttributeType: "S" }
        ],
        BillingMode: "PAY_PER_REQUEST"
    },
    {
        TableName: "FitnessCertificates",
        KeySchema: [{ AttributeName: "certificateId", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "certificateId", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST"
    }
];

const BUCKET_NAME = "dr-gawli-patient-files-use2-" + Math.floor(Math.random() * 10000); // Unique name

async function createTableIfNotExists(tableParams) {
    try {
        const listCommand = new ListTablesCommand({});
        const existingTables = await client.send(listCommand);

        if (existingTables.TableNames.includes(tableParams.TableName)) {
            console.log(`⚠️ Table ${tableParams.TableName} already exists. SKIPPING.`);
            return;
        }

        console.log(`Creation ${tableParams.TableName}...`);
        const command = new CreateTableCommand(tableParams);
        await client.send(command);
        console.log(`✅ Table ${tableParams.TableName} created.`);
    } catch (error) {
        console.error(`❌ Error creating table ${tableParams.TableName}:`, error.message);
    }
}

async function createBucketIfNotExists() {
    try {
        console.log(`Creating bucket ${BUCKET_NAME}...`);
        // Note: checking if bucket exists globally is complex, so we just try to create and catch
        // But for "safety" we should try to avoid collision. Added random suffix.

        const command = new CreateBucketCommand({
            Bucket: BUCKET_NAME,
            CreateBucketConfiguration: {
                LocationConstraint: REGION
            }
        });

        await s3Client.send(command);
        console.log(`✅ Bucket ${BUCKET_NAME} created.`);

        // CORS
        const corsCommand = new PutBucketCorsCommand({
            Bucket: BUCKET_NAME,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedHeaders: ["*"],
                        AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
                        AllowedOrigins: ["*"], // Restrict this in production
                        ExposeHeaders: ["ETag"]
                    }
                ]
            }
        });
        await s3Client.send(corsCommand);
        console.log(`✅ CORS configured for bucket.`);

        return BUCKET_NAME;

    } catch (error) {
        if (error.name === 'BucketAlreadyOwnedByYou' || error.name === 'BucketAlreadyExists') {
            console.log(`⚠️ Bucket ${BUCKET_NAME} already exists/owned. SKIPPING.`);
            return BUCKET_NAME;
        }
        console.error(`❌ Error creating bucket:`, error);
        return null;
    }
}

async function main() {
    console.log(`🚀 Starting AWS Resource Setup in ${REGION}...`);

    for (const table of TABLES) {
        await createTableIfNotExists(table);
    }

    const createdBucket = await createBucketIfNotExists();

    console.log("\n🎉 Setup Complete!");
    if (createdBucket) {
        console.log(`👉 PLEASE UPDATE YOUR LAMBDA CODE WITH THIS BUCKET NAME: ${createdBucket}`);
    }
}

main();
