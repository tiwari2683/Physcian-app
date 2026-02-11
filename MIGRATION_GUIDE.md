# Backend Migration Guide

A step-by-step guide to migrate the Physician App backend to a new AWS account.

---

## Prerequisites

- **AWS Account** with an IAM user that has programmatic access
- IAM user needs these policies: `AmazonDynamoDBFullAccess`, `AmazonS3FullAccess`, `AWSLambdaBasicExecutionRole`, `IAMFullAccess`, `AmazonAPIGatewayAdministrator`, `AmazonCognitoPowerUser`
- **Node.js v18+** installed
- Project cloned and `npm install` completed

---

## Step 1: Environment Setup

Create a `.env` file in the project root (**never commit this file**):

```env
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
```

Install required AWS SDK packages:

```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/client-s3 \
  @aws-sdk/client-lambda @aws-sdk/client-api-gateway @aws-sdk/client-iam \
  @aws-sdk/client-cognito-identity-provider dotenv archiver
```

---

## Step 2: Create DynamoDB Tables & S3 Bucket

> **Before running:** Open `scripts/setup_aws_resources.js` and update the `REGION` constant to your target region.

```bash
node scripts/setup_aws_resources.js
```

This creates 8 DynamoDB tables and 1 S3 bucket:

| Resource | Key Schema |
|----------|-----------|
| `Appointments` | `id` (HASH) |
| `Patients` | `patientId` (HASH) |
| `ClinicalParametersHistory` | `patientId` (HASH) + `timestamp` (RANGE) |
| `MedicalHistoryEntries` | `patientId` (HASH) + `timestamp` (RANGE) |
| `DiagnosisHistoryEntries` | `patientId` (HASH) + `timestamp` (RANGE) |
| `InvestigationsHistoryEntries` | `patientId` (HASH) + `timestamp` (RANGE) |
| `Medicines` | `PK` (HASH) + `SK` (RANGE) |
| `FitnessCertificates` | `certificateId` (HASH) |

> ⚠️ **The `Medicines` table uses `PK`/`SK`, NOT `id`.** The Lambda queries with `PK = "MEDICINE"` and `begins_with(SK, ...)`. Using the wrong schema will crash medicine search.

---

## Step 3: Deploy Lambda Functions

> **Before running:** Update the region in both Lambda source files:
> - `lambda/appointmentsFunction.js` — Line 5
> - `lambdaForCreateAsWellAsUpdate.js` — Lines 8, 15 (region) and Line 25 (S3 bucket name)

```bash
node scripts/deploy_lambdas.js
```

This creates:
- **IAM Role** `PhysicianAppLambdaRole` with DynamoDB, S3, and CloudWatch permissions
- **`appointmentsFunction`** — CommonJS module
- **`patientDataFunction`** — ES Module (auto-renamed to `.mjs` during packaging)

---

## Step 4: Set Up API Gateway

```bash
node scripts/setup_api_gateway.js
```

This creates:
- REST API named `PhysicianAppAPI`
- `/appointments` → `ANY` → `appointmentsFunction`
- `/patient-data` → `ANY` → `patientDataFunction`
- `OPTIONS` on both resources (CORS)
- Deploys to `prod` stage

📝 **Note the output URL** — you'll need it in Step 6.  
Format: `https://{api-id}.execute-api.{region}.amazonaws.com/prod`

---

## Step 5: Create Cognito User Pool

```bash
node scripts/setup_cognito.js
```

This creates:
- **User Pool** with email-based sign-up, verification code, and password policy (8+ chars, upper + lower + numbers)
- **App Client** (no secret, for mobile apps)

📝 **Note the output values** — `userPoolId` and `userPoolClientId` — you'll need them in Step 6.

> ⚠️ **Existing users cannot be migrated.** Cognito does not export passwords. All users must re-register.

> 💡 **Google OAuth** is not configured by this script. To add it later: AWS Console → Cognito → User Pool → Sign-in experience → Add identity provider → Google (requires Google Cloud OAuth Client ID/Secret).

---

## Step 6: Update Frontend Configuration

Update these 3 files with values from the previous steps:

### `aws-exports.js`

```javascript
const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: "YOUR_USER_POOL_ID",        // from Step 5
      userPoolClientId: "YOUR_CLIENT_ID",      // from Step 5
      signUpVerificationMethod: "code",
    },
  },
  Storage: {
    S3: {
      bucket: "YOUR_BUCKET_NAME",              // from Step 2
      region: "YOUR_REGION",
    },
  },
  API: {
    REST: {
      PhysicianAppAPI: {
        endpoint: "YOUR_API_GATEWAY_URL",      // from Step 4
        region: "YOUR_REGION",
      },
    },
  },
};
```

### `Config.ts`

```typescript
export const API_ENDPOINTS = {
  DOCTOR_DASHBOARD: "YOUR_API_GATEWAY_URL/patient-data",
  PATIENT_PROCESSOR: "YOUR_API_GATEWAY_URL/patient-data",
  APPOINTMENTS: "YOUR_API_GATEWAY_URL/appointments",
};

export const AWS_CONFIG = {
  REGION: "YOUR_REGION",
  S3_BUCKET: "YOUR_BUCKET_NAME",
  S3_URL_PREFIX: "https://YOUR_BUCKET_NAME.s3.YOUR_REGION.amazonaws.com/",
};
```

### `Components/Auth/SignInScreen.tsx`

Find the hardcoded `awsConfig` object (~line 51) and update:

```typescript
const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: "YOUR_USER_POOL_ID",
      userPoolClientId: "YOUR_CLIENT_ID",
      region: "YOUR_REGION",
      signUpVerificationMethod: "code" as const,
    },
  },
};
```

---

## Step 7: Verify

Restart the app with cache cleared:

```bash
npx expo start --clear
```

### Verification Checklist

| Feature | How to Test | Expected |
|---------|------------|----------|
| Sign Up | Register new user with email | Verification email received |
| Sign In | Log in with new credentials | Reaches Dashboard |
| Appointments | Open Appointments tab | Loads without errors |
| Create Patient | Fill and save patient form | Patient appears in Dashboard |
| File Upload | Upload a report file | File saved to S3 |
| Diagnosis History | Open patient → Diagnosis tab | No 502 errors |
| Investigations History | Open patient → Investigations tab | No 502 errors |
| Medicine Search | Search in prescription | Returns results or empty |

---

## Common Pitfalls

### 1. Medicines table uses wrong key schema
**Error:** `"The number of query conditions (2) exceeds the number of key attributes"`  
**Cause:** Table created with `id` instead of `PK`/`SK`.  
**Fix:** `node scripts/fix_medicines_table.js`

### 2. 403 "Missing Authentication Token" on Dashboard
**Cause:** `/patient-data` configured as `POST`-only, but some code sends `GET`.  
**Fix:** Use `ANY` method for both API Gateway resources.

### 3. 500 on Appointments endpoint
**Cause:** Lambda permission `SourceArn` uses `/*/ANY/*` instead of wildcards.  
**Fix:** Lambda permissions must use `/*/*/*` because API Gateway sends the actual HTTP method (e.g., `GET`), not `ANY`.

### 4. 502 on history endpoints
**Cause:** Lambda functions return `{ success: true, data: [] }` directly without the API Gateway wrapper.  
**Fix:** All Lambda responses must use `{ statusCode: 200, headers: {...}, body: JSON.stringify(...) }`. Use the `formatSuccessResponse()` helper.

### 5. Sign-up fails with "unauthorized attribute"
**Cause:** Cognito App Client's `WriteAttributes` doesn't include `given_name` and `family_name`.  
**Fix:** Update the App Client to allow writing: `email`, `name`, `phone_number`, `given_name`, `family_name`.

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/setup_aws_resources.js` | Create DynamoDB tables + S3 bucket |
| `scripts/deploy_lambdas.js` | Deploy Lambda functions |
| `scripts/setup_api_gateway.js` | Create API Gateway + integrations |
| `scripts/setup_cognito.js` | Create Cognito User Pool + App Client |
| `scripts/fix_medicines_table.js` | Fix Medicines table key schema |
| `scripts/patch_api_gateway.js` | Add methods to existing API |
