/**
 * Fitness Certificate PDF Template
 * 
 * Frontend-only PDF generation using expo-print
 * Follows the same pattern as generateprescription.tsx
 * 
 * NO backend dependency. NO AWS cost. NO Puppeteer.
 */

import { FormData } from "../Types/FitnessCertificateTypes";

// ===========================================
// PDF STYLES (A4-optimized, print-safe)
// ===========================================

export const certificatePdfStyles = `
  @page {
    size: A4;
    margin: 15mm;
  }
  
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
  }
  
  body {
    color: #2D3748;
    line-height: 1.5;
    padding: 10px;
    background-color: white;
    font-size: 12pt;
  }
  
  .certificate-container {
    max-width: 100%;
    margin: 0 auto;
    position: relative;
  }
  
  /* Header Section */
  .certificate-header {
    text-align: center;
    border-bottom: 3px solid #0070D6;
    padding-bottom: 15px;
    margin-bottom: 20px;
  }
  
  .certificate-title {
    font-size: 22pt;
    font-weight: bold;
    color: #0070D6;
    margin-bottom: 12px;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  
  .doctor-name {
    font-size: 16pt;
    font-weight: 600;
    color: #2D3748;
    margin-bottom: 4px;
  }
  
  .doctor-credentials {
    font-size: 11pt;
    color: #4A5568;
  }
  
  /* Section Styling */
  .section {
    margin-bottom: 16px;
  }
  
  .section-title {
    font-size: 11pt;
    font-weight: bold;
    color: #0070D6;
    border-bottom: 1px solid #E2E8F0;
    padding-bottom: 4px;
    margin-bottom: 8px;
    text-transform: uppercase;
  }
  
  /* Info Grid */
  .info-grid {
    display: table;
    width: 100%;
  }
  
  .info-row {
    display: table-row;
  }
  
  .info-label {
    display: table-cell;
    font-weight: 600;
    color: #4A5568;
    width: 160px;
    padding: 4px 0;
    vertical-align: top;
  }
  
  .info-value {
    display: table-cell;
    color: #2D3748;
    padding: 4px 0;
    vertical-align: top;
  }
  
  /* Pre-Op Section */
  .preop-text {
    font-size: 11pt;
    color: #2D3748;
    line-height: 1.6;
    margin-bottom: 6px;
  }
  
  .preop-highlight {
    font-weight: 600;
    color: #0070D6;
    text-decoration: underline;
  }
  
  /* Opinion Section */
  .opinion-container {
    background-color: #F7FAFC;
    border-left: 4px solid #0070D6;
    padding: 12px 15px;
    margin-top: 8px;
  }
  
  .opinion-type {
    font-weight: bold;
    color: #0070D6;
    font-size: 11pt;
    margin-bottom: 6px;
  }
  
  .opinion-content {
    font-size: 11pt;
    color: #2D3748;
    line-height: 1.6;
    white-space: pre-wrap;
  }
  
  /* Recommendations */
  .recommendations-content {
    font-size: 11pt;
    color: #2D3748;
    line-height: 1.6;
    white-space: pre-wrap;
  }
  
  /* Footer / Signature Section */
  .footer {
    display: table;
    width: 100%;
    margin-top: 40px;
    padding-top: 15px;
    border-top: 1px solid #E2E8F0;
  }
  
  .signature-cell {
    display: table-cell;
    width: 50%;
    vertical-align: bottom;
  }
  
  .validity-cell {
    display: table-cell;
    width: 50%;
    text-align: right;
    vertical-align: bottom;
  }
  
  .signature-line {
    width: 180px;
    height: 1px;
    background-color: #4A5568;
    margin-bottom: 6px;
  }
  
  .signature-name {
    font-weight: bold;
    font-size: 12pt;
    color: #2D3748;
  }
  
  .signature-title {
    font-size: 9pt;
    color: #718096;
  }
  
  .validity-text {
    font-size: 11pt;
    color: #4A5568;
    font-weight: 500;
  }
  
  .certificate-id {
    font-size: 8pt;
    color: #A0AEC0;
    margin-top: 4px;
  }
  
  /* Print Optimization */
  @media print {
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .certificate-container {
      page-break-inside: avoid;
    }
  }
`;

// ===========================================
// DOCTOR INFO (Default)
// ===========================================

export interface DoctorInfo {
    name: string;
    credentials: string;
}

export const DEFAULT_DOCTOR_INFO: DoctorInfo = {
    name: "Dr. Dipak Gawli",
    credentials: "MBBS, DNB General Medicine"
};

// ===========================================
// HTML GENERATION
// ===========================================

/**
 * Generate HTML content for Fitness Certificate PDF
 * 
 * @param formData - Certificate form data
 * @param doctorInfo - Optional doctor info override
 * @returns Complete HTML string ready for expo-print
 */
export function generateCertificateHtml(
    formData: Partial<FormData>,
    doctorInfo: DoctorInfo = DEFAULT_DOCTOR_INFO
): string {
    // Format current date
    const currentDate = new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });

    // Determine opinion type label and content
    const { opinionTypeLabel, opinionContent } = getOpinionDetails(formData);

    // Build HTML
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Medical Fitness Certificate</title>
  <style>
    ${certificatePdfStyles}
  </style>
</head>
<body>
  <div class="certificate-container">
    
    <!-- Header -->
    <div class="certificate-header">
      <div class="certificate-title">Medical Fitness Certificate</div>
      <div class="doctor-name">${doctorInfo.name}</div>
      <div class="doctor-credentials">${doctorInfo.credentials}</div>
    </div>
    
    <!-- Patient Information -->
    <div class="section">
      <div class="section-title">Patient Information</div>
      <div class="info-grid">
        <div class="info-row">
          <div class="info-label">Name:</div>
          <div class="info-value">${formData.patientName || "N/A"}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Age / Sex:</div>
          <div class="info-value">${formData.patientAge || "N/A"} years / ${formData.patientSex || "N/A"}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Date:</div>
          <div class="info-value">${currentDate}</div>
        </div>
      </div>
    </div>
    
    ${generatePreOpSection(formData)}
    
    <!-- Clinical Assessment -->
    <div class="section">
      <div class="section-title">Clinical Assessment</div>
      <div class="info-grid">
        <div class="info-row">
          <div class="info-label">Past History:</div>
          <div class="info-value">${formData.pastHistory || "No significant history"}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Cardio Respiratory:</div>
          <div class="info-value">${formData.cardioRespiratoryFunction || "Normal"}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Sy/E:</div>
          <div class="info-value">${formData.syE || "Normal"}</div>
        </div>
      </div>
    </div>
    
    <!-- Investigations -->
    <div class="section">
      <div class="section-title">Investigations</div>
      <div class="info-grid">
        <div class="info-row">
          <div class="info-label">ECG:</div>
          <div class="info-value">${formData.ecgField || "Normal"}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Echo:</div>
          <div class="info-value">${formData.echoField || "Normal"}</div>
        </div>
        <div class="info-row">
          <div class="info-label">CXR:</div>
          <div class="info-value">${formData.cxrField || "Normal"}</div>
        </div>
      </div>
    </div>
    
    <!-- Medical Opinion -->
    <div class="section">
      <div class="section-title">Medical Opinion</div>
      <div class="opinion-container">
        <div class="opinion-type">${opinionTypeLabel}</div>
        <div class="opinion-content">${opinionContent}</div>
      </div>
    </div>
    
    ${generateRecommendationsSection(formData)}
    
    <!-- Footer -->
    <div class="footer">
      <div class="signature-cell">
        <div class="signature-line"></div>
        <div class="signature-name">${doctorInfo.name}</div>
        <div class="signature-title">${doctorInfo.credentials}</div>
      </div>
      <div class="validity-cell">
        <div class="validity-text">Valid for: ${formData.validityPeriod || "30 days"}</div>
        <div class="certificate-id">Certificate ID: ${formData.certificateId || generateCertificateId()}</div>
      </div>
    </div>
    
  </div>
</body>
</html>
  `.trim();
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Get opinion type label and content based on selected type
 */
function getOpinionDetails(formData: Partial<FormData>): {
    opinionTypeLabel: string;
    opinionContent: string;
} {
    switch (formData.selectedOpinionType) {
        case "surgery_fitness":
            return {
                opinionTypeLabel: "Fitness for Surgery",
                opinionContent: formData.surgeryFitnessOption || "Not specified"
            };
        case "medication_modification":
            return {
                opinionTypeLabel: "Medication Modification",
                opinionContent: formData.medicationModificationText || "Not specified"
            };
        case "fitness_reserved":
            return {
                opinionTypeLabel: "Fitness Reserved For",
                opinionContent: formData.fitnessReservedText || "Not specified"
            };
        default:
            return {
                opinionTypeLabel: "Medical Opinion",
                opinionContent: "Not specified"
            };
    }
}

/**
 * Generate Pre-Op Evaluation section (optional)
 */
function generatePreOpSection(formData: Partial<FormData>): string {
    if (!formData.preOpEvaluationForm) {
        return "";
    }

    let referralText = "";
    if (formData.referredForPreOp) {
        referralText = `
      <div class="preop-text">
        Thanks for your reference. Referred for PreOp evaluation posted for 
        <span class="preop-highlight">Dr. ${formData.referredForPreOp}</span>
      </div>
    `;
    }

    return `
    <div class="section">
      <div class="section-title">Pre-Operative Evaluation</div>
      <div class="preop-text">
        PreOp evaluation / Fitness: 
        <span class="preop-highlight">${formData.preOpEvaluationForm}</span> form
      </div>
      ${referralText}
    </div>
  `;
}

/**
 * Generate Recommendations section (optional)
 */
function generateRecommendationsSection(formData: Partial<FormData>): string {
    if (!formData.recommendations) {
        return "";
    }

    return `
    <div class="section">
      <div class="section-title">Recommendations</div>
      <div class="recommendations-content">${formData.recommendations}</div>
    </div>
  `;
}

/**
 * Generate a unique certificate ID
 */
function generateCertificateId(): string {
    return `FC_${Date.now().toString(36).toUpperCase()}`;
}
