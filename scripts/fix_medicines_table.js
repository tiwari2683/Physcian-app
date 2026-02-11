/**
 * Fix Medicines table: Delete old one (wrong schema) and recreate with PK+SK.
 * Lambda expects: PK="MEDICINE" (HASH) + SK=normalizedName (RANGE)
 */
const { DynamoDBClient, DeleteTableCommand, CreateTableCommand, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}

const client = new DynamoDBClient({
    region: "us-east-2",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function waitForTableDeletion(tableName) {
    console.log(`   Waiting for table deletion...`);
    while (true) {
        try {
            await client.send(new DescribeTableCommand({ TableName: tableName }));
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            if (e.name === 'ResourceNotFoundException') {
                console.log(`   ✅ Table deleted.`);
                return;
            }
            throw e;
        }
    }
}

async function main() {
    try {
        const TABLE_NAME = "Medicines";

        // 1. Delete old table
        console.log(`🗑️  Deleting old ${TABLE_NAME} table (wrong schema: id only)...`);
        try {
            await client.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
            // Wait for deletion to complete
            console.log(`   Waiting for table deletion...`);
            let deleted = false;
            while (!deleted) {
                try {
                    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
                    await new Promise(r => setTimeout(r, 2000));
                } catch (descErr) {
                    if (descErr.name === 'ResourceNotFoundException') {
                        deleted = true;
                        console.log(`   ✅ Table deleted.`);
                    } else {
                        throw descErr;
                    }
                }
            }
        } catch (e) {
            if (e.name === 'ResourceNotFoundException') {
                console.log(`   Table doesn't exist, skipping delete.`);
            } else {
                throw e;
            }
        }

        // 2. Create with correct schema (PK + SK)
        console.log(`\n📝 Creating ${TABLE_NAME} with correct schema (PK + SK)...`);
        await client.send(new CreateTableCommand({
            TableName: TABLE_NAME,
            KeySchema: [
                { AttributeName: "PK", KeyType: "HASH" },
                { AttributeName: "SK", KeyType: "RANGE" }
            ],
            AttributeDefinitions: [
                { AttributeName: "PK", AttributeType: "S" },
                { AttributeName: "SK", AttributeType: "S" }
            ],
            BillingMode: "PAY_PER_REQUEST"
        }));

        console.log(`✅ ${TABLE_NAME} table recreated with PK (HASH) + SK (RANGE)!`);
        console.log(`   Lambda will use: PK="MEDICINE", SK=<normalized_medicine_name>`);

    } catch (error) {
        console.error("❌ Failed:", error);
    }
}

main();
