$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV2YWp3dGpxenZ2Zmlra2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDYxMzEsImV4cCI6MjA5MDcyMjEzMX0.RAuTnNM_ukLo2nB8SieB92ExM9x6kCkKhhOdBv--Jgc"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV2YWp3dGpxenZ2Zmlra2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDYxMzEsImV4cCI6MjA5MDcyMjEzMX0.RAuTnNM_ukLo2nB8SieB92ExM9x6kCkKhhOdBv--Jgc"
}

$tables = @("students", "staff", "classes", "subjects", "fees", "payments", "announcements", "schools")

Write-Host "=== SUPABASE DATABASE RECORDS ===" -ForegroundColor Cyan
Write-Host ""

foreach ($table in $tables) {
    try {
        $url = "https://zbpevajwtjqzvvfikkbj.supabase.co/rest/v1/$table?select=id&limit=1"
        $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
        $countUrl = "https://zbpevajwtjqzvvfikkbj.supabase.co/rest/v1/$table?select=id&count=exact"
        $countResponse = Invoke-RestMethod -Uri $countUrl -Method Get -Headers $headers -ContentType "application/json" -ErrorAction Stop
        $count = $countResponse.Length
        Write-Host "$table : $count records" -ForegroundColor $(if ($count -gt 0) { "Green" } else { "Yellow" })
    } catch {
        Write-Host "$table : ERROR - $($_.Exception.Message)" -ForegroundColor Red
    }
}
