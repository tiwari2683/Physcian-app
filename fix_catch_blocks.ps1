$ErrorActionPreference = "Stop"

$filePath = "e:\InternShip\try\DrGawliApp-main\Components\NewPatientForm\NewPatientForm.tsx"

# Read the entire file
$content = Get-Content $filePath -Raw

# Fix all catch blocks - specific errors first to avoid conflicts
$content = $content -replace 'catch \(networkError\)', 'catch (networkError: any)'
$content = $content -replace 'catch \(parseError\)', 'catch (parseError: any)'
$content = $content -replace 'catch \(fileError\)', 'catch (fileError: any)'
$content = $content -replace 'catch \(jsonError\)', 'catch (jsonError: any)'
$content = $content -replace 'catch \(visualTransferError\)', 'catch (visualTransferError: any)'
$content = $content -replace 'catch \(refError\)', 'catch (refError: any)'
$content = $content -replace 'catch \(error\)', 'catch (error: any)'

# Save the file
Set-Content $filePath -Value $content -NoNewline

Write-Host "Fixed all catch block type annotations!"
