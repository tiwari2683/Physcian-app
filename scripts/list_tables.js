const { DynamoDBClient, ListTablesCommand } = require("@aws-sdk/client-dynamodb");
const fs = require('fs');
const path = require('path');

// Manual .env parser
try {
    const envPath = path.join(__dirname, '..', 'assistant-panel', '.env');
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
} catch (error) {}

const client = new DynamoDBClient({
    region: "us-east-2",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function main() {
    try {
        const command = new ListTablesCommand({});
        const response = await client.send(command);
        console.log("Current Tables:", response.TableNames);
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main();
