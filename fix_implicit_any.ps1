$ErrorActionPreference = "Stop"

$filePath = "e:\InternShip\try\DrGawliApp-main\Components\NewPatientForm\NewPatientForm.tsx"

# Read the entire file
$content = Get-Content $filePath -Raw

# Fix implicit any parameters
$content = $content -replace '\(med\) =>', '(med: any) =>'
$content = $content -replace '\(section\) =>', '(section: string) =>'


# Save the file
Set-Content $filePath -Value $content -NoNewline

Write-Host "Fixed implicit 'any' type parameters!"
