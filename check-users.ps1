$envFile = Join-Path $PSScriptRoot "client\.env"
$envLines = Get-Content $envFile
$supabaseUrl = ($envLines | Where-Object { $_ -match '^VITE_SUPABASE_URL=' } | Select-Object -First 1) -replace '^VITE_SUPABASE_URL=', ''
$anonKey = ($envLines | Where-Object { $_ -match '^VITE_SUPABASE_ANON_KEY=' } | Select-Object -First 1) -replace '^VITE_SUPABASE_ANON_KEY=', ''

$headers = @{
    "apikey" = $anonKey
    "Authorization" = "Bearer $anonKey"
}

Write-Host "=== CHECKING USERS AND SCHOOLS ===" -ForegroundColor Cyan

try {
    $url = "$supabaseUrl/rest/v1/users?select=id,email,school_id"
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ContentType "application/json" -ErrorAction Stop
    Write-Host "Users:" -ForegroundColor Green
    $response | ForEach-Object { Write-Host "  $($_.email) -> school_id: $($_.school_id)" }
} catch {
    Write-Host "Users error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

try {
    $url = "$supabaseUrl/rest/v1/schools?select=id,name"
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ContentType "application/json" -ErrorAction Stop
    Write-Host "Schools:" -ForegroundColor Green
    $response | ForEach-Object { Write-Host "  $($_.name) (id: $($_.id))" }
} catch {
    Write-Host "Schools error: $($_.Exception.Message)" -ForegroundColor Red
}
