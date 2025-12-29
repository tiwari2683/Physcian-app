$file = 'e:\InternShip\try\DrGawliApp-main\Components\NewPatientForm\clinical.tsx'
$lines = Get-Content $file
# Keep lines 1-296 (indices 0-295)
# Skip lines 297-704 (indices 296-703)
# Keep lines 705+ (indices 704+)
$newLines = $lines[0..295] + $lines[704..($lines.Count-1)]
$newLines | Set-Content $file -Encoding UTF8
