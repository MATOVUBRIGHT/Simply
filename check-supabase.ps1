$envFile = Join-Path $PSScriptRoot "client\.env"
$envLines = Get-Content $envFile
$supabaseUrl = ($envLines | Where-Object { $_ -match '^VITE_SUPABASE_URL=' } | Select-Object -First 1) -replace '^VITE_SUPABASE_URL=', ''
$anonKey = ($envLines | Where-Object { $_ -match '^VITE_SUPABASE_ANON_KEY=' } | Select-Object -First 1) -replace '^VITE_SUPABASE_ANON_KEY=', ''

$headers = @{
    "apikey" = $anonKey
    "Authorization" = "Bearer $anonKey"
}

$tables = @("students", "staff", "classes", "subjects", "fees", "payments", "announcements", "schools")

Write-Host "=== SUPABASE DATABASE RECORDS ===" -ForegroundColor Cyan
Write-Host ""

foreach ($table in $tables) {
    try {
        $url = "$supabaseUrl/rest/v1/${table}?select=id"
        $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
        $count = $response.Count
        Write-Host "$table : $count records" -ForegroundColor $(if ($count -gt 0) { "Green" } else { "Yellow" })
    } catch {
        Write-Host "$table : ERROR - $($_.Exception.Message)" -ForegroundColor Red
    }
}
