$ErrorActionPreference = "Stop"

$oldUrl = "https://7pgwoalueh.execute-api.us-east-1.amazonaws.com/default/PatientDataProcessorFunction"
$newVar = "API_ENDPOINTS.PATIENT_PROCESSOR"

$files = @(
    "e:\InternShip\try\DrGawliApp-main\Components\NewPatientForm\hooks\useClinicalForm.ts",
    "e:\InternShip\try\DrGawliApp-main\Components\NewPatientForm\NewPatientForm.tsx",
    "e:\InternShip\try\DrGawliApp-main\Components\NewPatientForm\diagnosis.tsx",
    "e:\InternShip\try\DrGawliApp-main\Components\NewPatientForm\prescription.tsx",
    "e:\InternShip\try\DrGawliApp-main\Components\NewPatientForm\ViewHistoryModal.tsx",
    "e:\InternShip\try\DrGawliApp-main\Components\NewPatientForm\ViewParametersModal.tsx",
    "e:\InternShip\try\DrGawliApp-main\Components\NewPatientForm\ViewUploadedFilesModal.tsx",
    "e:\InternShip\try\DrGawliApp-main\Components\FitnessCertificate\FitnessCertificate.tsx"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "Processing: $file"
        $content = Get-Content $file -Raw
        
        # Replace the hardcoded URL string with the config variable
        $content = $content -replace [regex]::Escape("`"$oldUrl`""), $newVar
        
        # Also replace in template literals
        $content = $content -replace [regex]::Escape("``$oldUrl``"), $newVar
        
        Set-Content $file -Value $content -NoNewline
        Write-Host "  Updated!"
    } else {
        Write-Host "  File not found: $file"
    }
}

Write-Host "`n✅ All URLs replaced with API_ENDPOINTS.PATIENT_PROCESSOR"
