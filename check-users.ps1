$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV2YWp3dGpxenZ2Zmlra2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDYxMzEsImV4cCI6MjA5MDcyMjEzMX0.RAuTnNM_ukLo2nB8SieB92ExM9x6kCkKhhOdBv--Jgc"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV2YWp3dGpxenZ2Zmlra2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDYxMzEsImV4cCI6MjA5MDcyMjEzMX0.RAuTnNM_ukLo2nB8SieB92ExM9x6kCkKhhOdBv--Jgc"
}

Write-Host "=== CHECKING USERS AND SCHOOLS ===" -ForegroundColor Cyan

try {
    $url = "https://zbpevajwtjqzvvfikkbj.supabase.co/rest/v1/users?select=id,email,school_id"
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ContentType "application/json" -ErrorAction Stop
    Write-Host "Users:" -ForegroundColor Green
    $response | ForEach-Object { Write-Host "  $($_.email) -> school_id: $($_.school_id)" }
} catch {
    Write-Host "Users error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

try {
    $url = "https://zbpevajwtjqzvvfikkbj.supabase.co/rest/v1/schools?select=id,name"
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ContentType "application/json" -ErrorAction Stop
    Write-Host "Schools:" -ForegroundColor Green
    $response | ForEach-Object { Write-Host "  $($_.name) (id: $($_.id))" }
} catch {
    Write-Host "Schools error: $($_.Exception.Message)" -ForegroundColor Red
}