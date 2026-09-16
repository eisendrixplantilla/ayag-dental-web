# Ayag Dental Clinic — Bootstrap 5 Static Wireframe

A pure HTML/CSS/JS version of the clinic management system, built with **Bootstrap 5** (loaded via CDN) and the same brand palette and inline Lucide-style SVG icons used across the React app.

This folder mirrors `/static-wireframe` page-for-page, but the layout grid, cards, tables, forms, and buttons are built on Bootstrap classes instead of custom CSS.

## Open it locally

Just open any `.html` file in your browser — no build step.

```
open static-wireframe-bootstrap/login.html
```

## Pages (20 total)

**Auth**
- `login.html`
- `register.html`
- `verify.html` (6-digit OTP)
- `forgot-password.html`

**Patient portal**
- `patient-dashboard.html`
- `patient-book.html`
- `patient-appointments.html`
- `patient-records.html`

**Admin (Clinic Staff)**
- `admin-dashboard.html`
- `admin-patients.html`
- `admin-accounts.html`
- `admin-appointments.html` (walk-in)
- `admin-online-appointments.html`
- `admin-sales.html`
- `admin-inventory.html`
- `admin-reports.html`

**Super Admin**
- `superadmin-dashboard.html`
- `superadmin-staff.html`
- `superadmin-settings.html`
- `superadmin-reports.html`

## Tech stack

- **Bootstrap 5.3.3** via jsDelivr CDN (CSS + bundled JS for offcanvas / dropdowns)
- **styles.css** — Brand color overrides (teal `#25a39a` → cyan `#1ba0d9` gradient), sidebar, time-slot grid, tabs, custom toasts/modals
- **script.js** — Custom toast + modal system (preserved from the original wireframe), plus button handlers for confirm/decline/delete/edit/view/print/save/download

## Functionality preserved

All buttons trigger the same notifications and modals as the original wireframe:

- ✅ Sign in / Create account / Send reset code
- ✅ OTP verification with auto-focus + redirect to login
- ✅ Time-slot selection (single-select with toast)
- ✅ Tab switching (Visit History / Procedures / Prescriptions, Upcoming / Past)
- ✅ Confirm / Decline online appointments (with reason form)
- ✅ Add Walk-in / Confirm Booking
- ✅ Edit / View / Delete / Cancel buttons (modals + confirmations)
- ✅ Print receipt
- ✅ Add Patient / Item / Payment / Staff (form modals)
- ✅ Save Hours / Save Changes / Save price
- ✅ Download PDF / CSV (simulated progress toasts)
- ✅ Live table search filter
- ✅ Mobile hamburger toggles sidebar (offcanvas-style)
