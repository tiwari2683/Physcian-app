export const API_ENDPOINTS = {
  // Existing Lambdas
  DOCTOR_DASHBOARD: "https://prk3gdkf4jlejgxuhlhjudf7re0nptkh.lambda-url.ap-southeast-2.on.aws/",
  PATIENT_PROCESSOR: "https://prk3gdkf4jlejgxuhlhjudf7re0nptkh.lambda-url.ap-southeast-2.on.aws/",

  // Future/Planned Lambdas
  APPOINTMENTS: "https://gaoy6hke34n77hrndiojcjtvii0clxqy.lambda-url.ap-southeast-2.on.aws/",
};

export const AWS_CONFIG = {
  REGION: "ap-southeast-2",
  S3_BUCKET: "dr-gawli-patient-files",
  S3_URL_PREFIX: "https://dr-gawli-patient-files.s3.ap-southeast-2.amazonaws.com/",
};
