# Schofy Release Notes

## Version1.1

This release improves verification-code control, import reliability, preview workflows, offline plan behavior, and large-school performance.

### Highlights

- Added plan-specific verification code sheets, including 100 Unlimited plan codes.
- Added used verification code visibility in Super Admin with terminate and re-enable actions.
- Added bulk subject entry from the Add Subject dialog.
- Added full-screen controls to preview screens and templates.
- Expanded import previews so all parsed rows are shown and unmatched/skipped rows are reported.
- Kept verified plan access saved offline while blocking offline plan changes.
- Improved large data loading with indexed lookups, paged student display, cached student pages, and loading spinners.

### Technical Notes

- App package versions are now `1.1.0`.
- UI release labels are now `Version1.1`.
- Desktop update manifest now points to `v1.1.0`.

## Version1

This release focuses on making Schofy broader, faster, and more school-ready across academics, finance, reporting, communication, and offline sync.

### Highlights

- Added new report card templates for Nursery, Primary, O-level, A-level new curriculum, secondary default subjects, and head/class teacher signature layouts.
- Added school logo support across sidebar, reports, invoices, ledgers, report cards, and print/PDF outputs, including watermark support on report cards.
- Renamed Classes to Classes & Timetables and added a full timetable editor with class, exam, custom event, free time, room, collision detection, full-screen editing, print views, and colored timetable highlights.
- Added a Student Profile Subjects tab for default class subjects, optional OP subjects, and S5/S6 subject combinations with custom combinations.
- Added Parents & Emails management with parent/student email selection, class filtering, and copy tools.
- Added Assignments for homework/tests with issued, completed, and results views plus edit, delete, and email actions.
- Added custom grading as a dedicated page.
- Added expense recording with payment method support and profit reporting by term/year.
- Added payment account setup pages for bank/mobile money/cash details and invoice display control.
- Improved invoices with filtering, multi-select deletion, editable status/amount, school-focused invoice templates, and valid-data-only invoice rows.
- Added one-time payment verification codes for online/offline plan activation plus admin termination support.
- Added assistant read-aloud with a natural lady voice, including automatic stop when chat closes.
- Added sidebar organization with grouped beginner-friendly sections and restore-to-default confirmation.

### Improvements

- Improved attendance import flow, template selection, class/student mapping, autosave, and progress handling.
- Improved list/card responsiveness, scrolling, column spacing, filter sizing, search clearing, and button scroll behavior.
- Removed gray ID highlights and fixed student ID search mismatch behavior.
- Improved teacher class assignment ordering and instant staff/profile updates.
- Improved day/boarding views with gender lists hidden behind view-all pages.
- Improved profile extra records so details are shown and editable.
- Improved report previews, profits cards, selected-card printing, and dashboard growth metrics.
- Improved Supabase/offline sync resilience, including missing-column fallback and quieter realtime logs.

### Technical Notes

- UI release label is now `Version1` in the sidebar footer, profile dropdown, settings header, and update banner.
- Database migration added: `supabase/migrations/032_add_expense_timetable_columns.sql`.
- Recommended Supabase migration columns:
  - `expenses.payment_method`
  - `timetable.entry_type`
  - `timetable.exam_id`
  - `timetable.custom_name`
