# Contact Details widget (Zoho CRM)

A widget for the Contact record detail page that shows and edits First
Name, Last Name, Phone and Email, plus a mailing address block where a
postal code auto-fills city / state / country via a free geocoding API.

Built as a plain CRM widget (HTML/CSS/JS + the Zoho Widget SDK), not a
full zet extension — this keeps the deliverable to a single zip that
installs in a couple of clicks in any org, per the brief's "any approach
that produces a working widget in your org is acceptable."

## Project structure

```
zoho-contact-widget/
├── index.html      widget markup
├── css/style.css    styling
├── js/app.js        all widget logic (load, edit, save, postal lookup)
└── README.md
```

## How to install and run it in a fresh Zoho org

1. **Get a developer org.** Sign up for a free Zoho CRM account at
   zoho.com if you don't already have one (Trial / Developer edition
   is fine).
2. **Create 2–3 sample Contacts** (Contacts module → Create Contact).
   Give at least one of them a first/last name, phone and email so
   there's something to see on first load.
3. **Zip the widget.** Zip the *contents* of this folder — `index.html`
   must sit at the root of the zip, not inside a subfolder.
4. **Upload the widget.**
   - Go to **Setup → Developer Space → Widgets** (in some Zoho CRM UI
     versions this is under **Setup → Marketplace → All → Widgets**;
     search "Widgets" in Setup if the menu has moved).
   - Click **Create Widget**, choose **Upload a zip file**, select the
     zip from step 3, and give it a name (e.g. "Contact Details").
5. **Place it on the Contact layout.**
   - Go to **Setup → Customization → Modules and Fields → Contacts**,
     open the layout you want (usually "Standard"), and enter the
     layout editor.
   - Drag a **Widget** component onto the detail page and pick the
     widget you just uploaded, then save the layout.
6. **Open any Contact record.** The widget should load that contact's
   details within a second or two. Click **Edit**, change a field,
   click **Save changes** — then refresh the page to confirm the CRM
   record (not just the widget) now shows the new values.

If your org's Setup menu labels differ slightly from the above (Zoho
renames things across releases and data centers), searching "widget"
in the Setup search box will get you there.

## Address API: OpenStreetMap Nominatim

**Endpoint used:** `https://nominatim.openstreetmap.org/search?postalcode=<value>&format=jsonv2&addressdetails=1`

**Why this one:**
- Free, no API key or account signup — one less thing to configure in
  a fresh org, and nothing to leak in client-side JS.
- Global coverage. The brief doesn't scope the widget to one country,
  and Nominatim will attempt a lookup for postal codes from most
  countries without needing a separate country selector in the UI
  (unlike e.g. Zippopotam.us, which requires the country code as part
  of the request path).
- Returns `city`/`town`/`village`, `state`, and `country` in one call,
  which maps directly onto the three auto-filled fields the brief
  asks for.

**Limitations (worth knowing before relying on this in production):**
- **Usage policy, not a real SLA.** Nominatim's public instance asks
  for roughly ≤1 request/second and no bulk/business use. Fine for a
  single user typing into a widget; not something to point a
  high-traffic integration at without self-hosting Nominatim or
  switching to a paid geocoder.
- **Coverage is uneven.** Postal-code-only search works well in
  countries with structured postal systems (US, UK, most of Europe,
  Brazil) and is patchier in places with sparse OpenStreetMap postal
  data — the widget surfaces "No match" rather than failing silently
  in that case.
- **No official CORS guarantee.** It works from browser `fetch` today
  and is commonly used this way, but Nominatim's docs don't formally
  commit to CORS support continuing — worth a fallback plan if this
  went to production.
- The returned `state`/`region` naming isn't always a clean US-style
  "state" (e.g. it may return a broader or narrower administrative
  region depending on the country), so it's shown as an editable
  field rather than locked, and the save button always sends whatever
  is currently in the field — auto-filled or hand-corrected.

## What I'd do differently with more time

- **Debounced validation feedback** on phone/email format before save,
  not just the empty-name check that's there now.
- **Optimistic UI** for the save button instead of a blocking spinner,
  with a proper rollback path if `updateRecord` fails.
- **A country-aware fallback**: try Nominatim first, and if it returns
  nothing, offer a manual country selector so the postal-code-only
  search has a second chance (e.g. Zippopotam.us as a secondary
  lookup once a country is picked).
- **Field-level diffing** so `updateRecord` only sends changed fields
  instead of the whole payload every save — smaller requests and
  cleaner audit history in CRM.
- **A short Playwright/Jest smoke test** for the save round-trip,
  even though automated tests were explicitly out of scope here —
  it's the first thing I'd add back for anything beyond a case study.

## Assumptions made

- "Phone" in the brief maps to the Contacts module's standard `Phone`
  field (not `Mobile`).
- The address fields map to the Contacts module's standard mailing
  address fields (`Mailing_Street`, `Mailing_City`, `Mailing_State`,
  `Mailing_Zip`, `Mailing_Country`), since those exist by default on
  any fresh org and the brief doesn't call for a custom field set.
- "Street address stays manually entered" means it's never
  auto-filled by the API, but it's still editable inline like the
  other fields — not a separate, differently-styled input.
- The widget is placed via the standard "Widget" layout component
  (Setup → layout editor) rather than as a Canvas view or a
  full zet extension, since the brief explicitly allows "any approach
  that produces a working widget in your org."
- No authentication/permission handling was built, per the "explicitly
  out of scope" list — the widget relies entirely on the permissions
  of whichever CRM user has the record open.

## Recording

Not included in this zip — see the case study brief for the 3-minute
walkthrough deliverable (Loom or similar), recorded separately after
this widget is installed in a live org.
