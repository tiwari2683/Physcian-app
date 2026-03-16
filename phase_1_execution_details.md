# Phase 1: Infrastructure & Backend Refactor

## 1. Database Provisioning (Manual)

Since no Infrastructure-as-Code (IaC) files were found in the repository, the `Visits` table must be created manually. 

### AWS CLI Command
Run the following command to create the `Visits` table with a Partition Key and a Global Secondary Index (GSI) for querying active visits by patient:

```bash
aws dynamodb create-table \
    --table-name Visits \
    --attribute-definitions \
        AttributeName=visitId,AttributeType=S \
        AttributeName=patientId,AttributeType=S \
        AttributeName=status,AttributeType=S \
    --key-schema \
        AttributeName=visitId,KeyType=HASH \
    --provisioned-throughput \
        ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --global-secondary-indexes \
        "[
            {
                \"IndexName\": \"patientId-status-index\",
                \"KeySchema\": [
                    {\"AttributeName\":\"patientId\",\"KeyType\":\"HASH\"},
                    {\"AttributeName\":\"status\",\"KeyType\":\"RANGE\"}
                ],
                \"Projection\": {
                    \"ProjectionType\":\"ALL\"
                },
                \"ProvisionedThroughput\": {
                    \"ReadCapacityUnits\": 5,
                    \"WriteCapacityUnits\": 5
                }
            }
        ]"
```

---

## 2. Refactored Backend Logic (`lambdaForCreateAsWellAsUpdate.js`)

The following functions will be implemented to handle the new "Active Visit" lifecycle.

### 2.1 Initiate Visit (`initiateVisit`)
*Targeted at the Assistant's intake.*

```javascript
async function initiateVisit(requestData) {
    const { patientId, name, age, sex, mobile, address } = requestData;
    const visitId = `visit_${randomUUID()}`;
    
    const visitItem = {
        visitId,
        patientId,
        status: 'WAITING',
        createdAt: new Date().toISOString(),
        // Chronic data for context (demographics)
        name, age, sex, mobile, address,
        // Acute fields initialized as empty
        diagnosis: '',
        medications: [],
        clinicalParameters: {},
        reportFiles: []
    };

    await dynamodb.send(new PutCommand({
        TableName: 'Visits',
        Item: visitItem
    }));

    return { success: true, visitId };
}
```

### 2.2 Get Active Visit (`getActiveVisit`)
*Queries the GSI for 'WAITING' or 'IN_PROGRESS' visits.*

```javascript
async function getActiveVisit(patientId) {
    // Check for WAITING status
    const waitingRes = await dynamodb.send(new QueryCommand({
        TableName: 'Visits',
        IndexName: 'patientId-status-index',
        KeyConditionExpression: 'patientId = :pid AND #status = :s',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':pid': patientId, ':s': 'WAITING' }
    }));

    if (waitingRes.Items && waitingRes.Items.length > 0) return waitingRes.Items[0];

    // Check for IN_PROGRESS status
    const progressRes = await dynamodb.send(new QueryCommand({
        TableName: 'Visits',
        IndexName: 'patientId-status-index',
        KeyConditionExpression: 'patientId = :pid AND #status = :s',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':pid': patientId, ':s': 'IN_PROGRESS' }
    }));

    return progressRes.Items && progressRes.Items.length > 0 ? progressRes.Items[0] : null;
}
```

### 2.3 Complete Visit (`completeVisit` - Atomic)
*Marks visit as COMPLETED and appends a snapshot to the Master Record with null handling.*

```javascript
async function completeVisit(requestData) {
    const { visitId, patientId, acuteData } = requestData;
    const timestamp = new Date().toISOString();

    const visitSummary = {
        visitId,
        date: timestamp,
        diagnosis: acuteData.diagnosis,
        medications: acuteData.medications
    };

    // Atomic Transaction: Resolve overwriting & history preservation
    const params = {
        TransactItems: [
            {
                // 1. Update Visit Status
                Update: {
                    TableName: 'Visits',
                    Key: { visitId },
                    UpdateExpression: 'SET #status = :c, completedAt = :t',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: { ':c': 'COMPLETED', ':t': timestamp }
                }
            },
            {
                // 2. Append to Patient Master (Safe null handling)
                Update: {
                    TableName: 'Patients',
                    Key: { patientId },
                    UpdateExpression: 'SET visitHistory = list_append(if_not_exists(visitHistory, :empty_list), :new_visit)',
                    ExpressionAttributeValues: {
                        ':new_visit': [visitSummary],
                        ':empty_list': []
                    }
                }
            }
        ]
    };

    await dynamodb.send(new TransactWriteCommand(params));
    return { success: true };
}
```
