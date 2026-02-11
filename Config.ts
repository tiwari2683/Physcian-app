// Migrated to us-east-2
export const API_ENDPOINTS = {
  // Existing Lambdas (Updated to API Gateway)
  DOCTOR_DASHBOARD: "https://ilyrmohedb.execute-api.us-east-2.amazonaws.com/prod/patient-data",
  PATIENT_PROCESSOR: "https://ilyrmohedb.execute-api.us-east-2.amazonaws.com/prod/patient-data",

  // Future/Planned Lambdas
  APPOINTMENTS: "https://ilyrmohedb.execute-api.us-east-2.amazonaws.com/prod/appointments",
};

export const AWS_CONFIG = {
  REGION: "us-east-2",
  S3_BUCKET: "dr-gawli-patient-files-use2-5694",
  S3_URL_PREFIX: "https://dr-gawli-patient-files-use2-5694.s3.us-east-2.amazonaws.com/",
};
