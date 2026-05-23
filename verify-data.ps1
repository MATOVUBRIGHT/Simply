$envFile = Join-Path $PSScriptRoot "client\.env"
$envLines = Get-Content $envFile
$supabaseUrl = ($envLines | Where-Object { $_ -match '^VITE_SUPABASE_URL=' } | Select-Object -First 1) -replace '^VITE_SUPABASE_URL=', ''
$anonKey = ($envLines | Where-Object { $_ -match '^VITE_SUPABASE_ANON_KEY=' } | Select-Object -First 1) -replace '^VITE_SUPABASE_ANON_KEY=', ''

$headers = @{
    "apikey" = $anonKey
    "Authorization" = "Bearer $anonKey"
}

Write-Host "=== RECORD COUNTS IN SUPABASE ===" -ForegroundColor Cyan
Write-Host ""

$tables = @("schools", "students", "staff", "classes", "subjects", "fees", "payments", "announcements", "attendance", "fee_structures")

foreach ($table in $tables) {
    try {
        $url = "$supabaseUrl/rest/v1/${table}?select=id"
        $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ContentType "application/json" -ErrorAction Stop
        $count = $response.Count
        $color = if ($count -gt 0) { "Green" } else { "Yellow" }
        Write-Host "$table : $count records" -ForegroundColor $color
    } catch {
        Write-Host "$table : ERROR" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== SCHOOLS ===" -ForegroundColor Cyan
try {
    $url = "$supabaseUrl/rest/v1/schools?select=name"
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ContentType "application/json" -ErrorAction Stop
    $response | ForEach-Object { Write-Host "  - $($_.name)" }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}
