export const API_ENDPOINTS = {
  // Existing Lambdas
  DOCTOR_DASHBOARD: "https://0kcyg9xic1.execute-api.us-east-1.amazonaws.com/default/DoctorDataWhisperer",
  PATIENT_PROCESSOR: "https://7pgwoalueh.execute-api.us-east-1.amazonaws.com/default/PatientDataProcessorFunction",

  // Future/Planned Lambdas
  APPOINTMENTS: "https://gaoy6hke34n77hrndiojcjtvii0clxqy.lambda-url.ap-southeast-2.on.aws/",
};

export const AWS_CONFIG = {
  REGION: "us-east-1",
  S3_BUCKET: "mypatientsbucket",
  S3_URL_PREFIX: "https://s3.amazonaws.com/mypatientsbucket/",
};
