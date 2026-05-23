$envFile = Join-Path $PSScriptRoot "client\.env"
$envLines = Get-Content $envFile
$supabaseUrl = ($envLines | Where-Object { $_ -match '^VITE_SUPABASE_URL=' } | Select-Object -First 1) -replace '^VITE_SUPABASE_URL=', ''
$anonKey = ($envLines | Where-Object { $_ -match '^VITE_SUPABASE_ANON_KEY=' } | Select-Object -First 1) -replace '^VITE_SUPABASE_ANON_KEY=', ''

$headers = @{
    "apikey" = $anonKey
    "Authorization" = "Bearer $anonKey"
}

Write-Host "=== CHECKING TABLES IN SUPABASE ===" -ForegroundColor Cyan

try {
    $url = "$supabaseUrl/rest/v1/?select=table_name"
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ContentType "application/json"
    Write-Host "Tables found:" -ForegroundColor Green
    $response | ForEach-Object { Write-Host "  - $($_.table_name)" }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== TRYING DIRECT TABLE QUERY ===" -ForegroundColor Cyan

$tables = @("schools", "students", "staff", "classes", "subjects", "fees", "payments", "announcements")

foreach ($table in $tables) {
    try {
        $url = "$supabaseUrl/rest/v1/${table}?select=id&limit=1"
        $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ContentType "application/json" -ErrorAction Stop
        Write-Host "$table : OK" -ForegroundColor Green
    } catch {
        Write-Host "$table : $($_.Exception.Message)" -ForegroundColor Yellow
    }
}
