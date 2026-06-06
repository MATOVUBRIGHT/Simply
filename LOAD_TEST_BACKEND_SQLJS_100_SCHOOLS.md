# Schofy Backend SQL.js Capacity Simulation

Run date: 2026-06-05T12:08:54.023Z

- Schools: 100
- Students: 500,000
- Staff: 50,000
- Total records: 550,000
- Seed/insert time: 3784.71ms
- Total time: 4712.03ms
- Exported SQL.js DB size: 109.50MB
- Page query avg/P95: 2.04ms / 4.14ms
- Count query avg/P95: 1.08ms / 1.68ms
- Search query avg/P95: 1.67ms / 3.73ms

```json
{
  "config": {
    "schools": 100,
    "studentsPerSchool": 5000,
    "staffPerSchool": 500,
    "totalStudents": 500000,
    "totalStaff": 50000,
    "totalPeopleRecords": 550000
  },
  "seedMs": 3784.7115,
  "totalMs": 4712.0307999999995,
  "queryMs": {
    "countAvg": 1.0763400000000138,
    "countP95": 1.679200000000037,
    "pageAvg": 2.040041000000033,
    "pageP95": 4.1424000000006345,
    "searchAvg": 1.6704484999999978,
    "searchP95": 3.7312999999994645
  },
  "databaseSizeMb": 109.5,
  "memory": {
    "heapUsedMb": 8.633758544921875,
    "heapTotalMb": 13.87890625,
    "rssMb": 278.43359375
  }
}
```
