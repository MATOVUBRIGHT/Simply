# Schofy Capacity Simulation

Run date: 2026-06-05T12:07:04.338Z

## Scenario

- Schools: 100
- Students per school: 5000
- Staff per school: 500
- Total students: 500,000
- Total staff: 50,000
- Total person records: 550,000

## Machine Simulation Results

- Dataset generation: 1359.65ms
- Sorting/search indexing: 1294.32ms
- Total simulation time: 2837.59ms
- Heap used at end: 440.07MB
- RSS at end: 585.64MB

## Per-School Page Handling

- Average school page load computation: 0.15ms
- P95 school page load computation: 0.26ms
- Max school page load computation: 0.37ms
- Students page: 42 progressive chunks of 120 rows to reveal all 5,000 students.
- Staff page: 5 progressive chunks of 120 rows to reveal all 500 staff.

## Search / Filter Simulation

- Student search average: 0.38ms
- Student search P95: 0.62ms
- Student search max: 1.13ms
- Staff search average: 0.04ms
- Staff search P95: 0.06ms
- Staff search max: 0.08ms

## Backend / Sync Estimate

- Records to sync: 550,000
- Suggested batch size: 1,000
- Batches needed: 550
- Estimated raw JSON payload: 445.84MB

## Notes

- This test does not write 550,000 rows to Supabase, so it avoids backend credit usage.
- It measures local/offline data pressure, per-school list handling, search/filter cost, and sync batch sizing.
- For production backend proof, run the same scenario against a staging Supabase project with paid quota and indexes on `school_id`, ID fields, names, class, status, and updated timestamp.

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
  "timings": {
    "datasetGenerationMs": 1359.6517,
    "indexingMs": 1294.3195000000003,
    "totalMs": 2837.5937,
    "pageLoad": {
      "avgMs": 0.14596500000001014,
      "p95Ms": 0.2645999999999731,
      "maxMs": 0.36819999999988795
    },
    "studentSearch": {
      "avgMs": 0.38155675000000544,
      "p95Ms": 0.6201999999998407,
      "maxMs": 1.130699999999706,
      "totalHits": 43000
    },
    "staffSearch": {
      "avgMs": 0.03601949999998055,
      "p95Ms": 0.05540000000019063,
      "maxMs": 0.08259999999972933,
      "totalHits": 38500
    },
    "progressiveLists": {
      "studentPagesToShowAll": 42,
      "staffPagesToShowAll": 5,
      "studentSimulationMs": 0.024699999999938882,
      "staffSimulationMs": 0.00279999999975189
    },
    "backendBatchEstimate": {
      "duration": 0.0079000000000633,
      "batchSize": 1000,
      "batches": 550,
      "estimatedPayloadMb": 445.8427429199219,
      "retryQueueEntries": 550
    }
  },
  "memory": [
    {
      "label": "start",
      "heapUsedMb": 4.589424133300781,
      "heapTotalMb": 5.62890625,
      "rssMb": 40.19140625
    },
    {
      "label": "after data generation",
      "heapUsedMb": 318.70919036865234,
      "heapTotalMb": 395.67578125,
      "rssMb": 442.8671875
    },
    {
      "label": "after indexing",
      "heapUsedMb": 417.03841400146484,
      "heapTotalMb": 532.9453125,
      "rssMb": 585.06640625
    },
    {
      "label": "end",
      "heapUsedMb": 440.07071685791016,
      "heapTotalMb": 532.9453125,
      "rssMb": 585.63671875
    }
  ]
}
```
