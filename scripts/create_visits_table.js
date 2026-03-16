const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require("@aws-sdk/client-dynamodb");
const fs = require('fs');
const path = require('path');

// Manual .env parser
try {
    const envPath = path.join(__dirname, '..', 'assistant-panel', '.env');
    if (!fs.existsSync(envPath)) {
        console.error("❌ assistant-panel/.env NOT found. Please ensure it has AWS credentials.");
    } else {
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
    console.warn("Error reading .env:", error.message);
}

const REGION = "us-east-2";
const TABLE_NAME = "Visits";

const client = new DynamoDBClient({
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function main() {
    console.log(`🚀 Provisioning '${TABLE_NAME}' table in ${REGION}...`);

    try {
        const list = await client.send(new ListTablesCommand({}));
        if (list.TableNames.includes(TABLE_NAME)) {
            console.log(`⚠️ Table '${TABLE_NAME}' already exists. Skipping.`);
            return;
        }

        const params = {
            TableName: TABLE_NAME,
            KeySchema: [
                { AttributeName: "visitId", KeyType: "HASH" } // Partition Key
            ],
            AttributeDefinitions: [
                { AttributeName: "visitId", AttributeType: "S" },
                { AttributeName: "patientId", AttributeType: "S" },
                { AttributeName: "status", AttributeType: "S" }
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: "patientId-index",
                    KeySchema: [
                        { AttributeName: "patientId", KeyType: "HASH" }, // GSI Partition Key
                        { AttributeName: "status", KeyType: "RANGE" }    // GSI Sort Key
                    ],
                    Projection: {
                        ProjectionType: "ALL"
                    },
                    ProvisionedThroughput: {
                        ReadCapacityUnits: 5,
                        WriteCapacityUnits: 5
                    }
                }
            ],
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        };

        const command = new CreateTableCommand(params);
        await client.send(command);
        console.log(`✅ Table '${TABLE_NAME}' created successfully with GSI 'patientId-index'.`);

    } catch (error) {
        console.error("❌ Failed to create table:", error.message);
        if (error.message.includes("credential")) {
            console.log("\n💡 TIP: Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to your assistant-panel/.env file");
        }
    }
}

main();
