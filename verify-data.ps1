$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV2YWp3dGpxenZ2Zmlra2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDYxMzEsImV4cCI6MjA5MDcyMjEzMX0.RAuTnNM_ukLo2nB8SieB92ExM9x6kCkKhhOdBv--Jgc"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV2YWp3dGpxenZ2Zmlra2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDYxMzEsImV4cCI6MjA5MDcyMjEzMX0.RAuTnNM_ukLo2nB8SieB92ExM9x6kCkKhhOdBv--Jgc"
}

Write-Host "=== RECORD COUNTS IN SUPABASE ===" -ForegroundColor Cyan
Write-Host ""

$tables = @("schools", "students", "staff", "classes", "subjects", "fees", "payments", "announcements", "attendance", "fee_structures")

foreach ($table in $tables) {
    try {
        $url = "https://zbpevajwtjqzvvfikkbj.supabase.co/rest/v1/$table?select=id"
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
    $url = "https://zbpevajwtjqzvvfikkbj.supabase.co/rest/v1/schools?select=name"
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ContentType "application/json" -ErrorAction Stop
    $response | ForEach-Object { Write-Host "  - $($_.name)" }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}