$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV2YWp3dGpxenZ2Zmlra2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDYxMzEsImV4cCI6MjA5MDcyMjEzMX0.RAuTnNM_ukLo2nB8SieB92ExM9x6kCkKhhOdBv--Jgc"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV2YWp3dGpxenZ2Zmlra2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDYxMzEsImV4cCI6MjA5MDcyMjEzMX0.RAuTnNM_ukLo2nB8SieB92ExM9x6kCkKhhOdBv--Jgc"
}

Write-Host "=== CHECKING TABLES IN SUPABASE ===" -ForegroundColor Cyan

try {
    $url = "https://zbpevajwtjqzvvfikkbj.supabase.co/rest/v1/?select=table_name"
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
        $url = "https://zbpevajwtjqzvvfikkbj.supabase.co/rest/v1/$table?select=id&limit=1"
        $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ContentType "application/json" -ErrorAction Stop
        Write-Host "$table : OK" -ForegroundColor Green
    } catch {
        Write-Host "$table : $($_.Exception.Message)" -ForegroundColor Yellow
    }
}