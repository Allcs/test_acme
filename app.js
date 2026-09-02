/**
 * Contact Details widget
 * ----------------------
 * Renders on the Contact record detail page. Reads the four core fields
 * plus the mailing address straight from the CRM record (no hardcoding),
 * lets the user edit them in place, and looks up city / state / country
 * from a postal code via a free geocoding API (see README for why).
 */

(function () {
  "use strict";

  var MODULE = "Contacts";

  // API name <-> DOM id map. Everything keys off this so adding a field
  // later is a one-line change instead of touching every function.
  var FIELD_MAP = {
    First_Name: "firstName",
    Last_Name: "lastName",
    Phone: "phone",
    Email: "email",
    Mailing_Street: "street",
    Mailing_Zip: "postalCode",
    Mailing_City: "city",
    Mailing_State: "state",
    Mailing_Country: "country"
  };

  var ADDRESS_LOOKUP_FIELDS = ["city", "state", "country"]; // filled by the API, not typed by the user
  var LOOKUP_DEBOUNCE_MS = 500;
  var NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

  var els = {};
  var state = {
    recordId: null,
    record: null, // last known-good record from CRM, keyed by API name
    editing: false,
    saving: false,
    lookupTimer: null
  };

  document.addEventListener("DOMContentLoaded", function () {
    cacheEls();
    wireEvents();
    boot();
  });

  function cacheEls() {
    els.app = document.getElementById("app");
    els.loadingState = document.getElementById("loadingState");
    els.errorState = document.getElementById("errorState");
    els.errorMessage = document.getElementById("errorMessage");
    els.retryBtn = document.getElementById("retryBtn");
    els.mainContent = document.getElementById("mainContent");
    els.avatarInitials = document.getElementById("avatarInitials");
    els.fullNameHeading = document.getElementById("fullNameHeading");
    els.statusPill = document.getElementById("statusPill");
    els.editBtn = document.getElementById("editBtn");
    els.form = document.getElementById("contactForm");
    els.editActions = document.getElementById("editActions");
    els.saveHint = document.getElementById("saveHint");
    els.cancelBtn = document.getElementById("cancelBtn");
    els.saveBtn = document.getElementById("saveBtn");
    els.lookupBtn = document.getElementById("lookupBtn");
    els.lookupStatus = document.getElementById("lookupStatus");
    els.toast = document.getElementById("toast");

    Object.keys(FIELD_MAP).forEach(function (apiName) {
      els[FIELD_MAP[apiName]] = document.getElementById(FIELD_MAP[apiName]);
    });
  }

  function wireEvents() {
    els.editBtn.addEventListener("click", enterEditMode);
    els.cancelBtn.addEventListener("click", exitEditMode);
    els.form.addEventListener("submit", onSave);
    els.retryBtn.addEventListener("click", boot);
    els.lookupBtn.addEventListener("click", function () {
      runPostalLookup(els.postalCode.value);
    });
    els.postalCode.addEventListener("input", function () {
      clearTimeout(state.lookupTimer);
      var value = els.postalCode.value.trim();
      clearAutofillMarks();
      if (!value) {
        setLookupStatus("", "");
        return;
      }
      state.lookupTimer = setTimeout(function () {
        runPostalLookup(value);
      }, LOOKUP_DEBOUNCE_MS);
    });
  }

  // ---- Boot / data loading -------------------------------------------------

  function boot() {
    showLoading();

    // Widget SDK: register the PageLoad handler *before* calling init().
    // PageLoad fires once the widget is mounted inside the record page and
    // hands us the id of the record we're sitting on.
    ZOHO.embeddedApp.on("PageLoad", function (data) {
      state.recordId = data && data.EntityId ? data.EntityId[0] : null;
      if (!state.recordId) {
        showError("Couldn't determine which contact this widget is on.");
        return;
      }
      loadRecord();
    });

    ZOHO.embeddedApp.init();
  }

  function loadRecord() {
    ZOHO.CRM.API.getRecord({ Entity: MODULE, RecordID: state.recordId })
      .then(function (response) {
        if (!response || !response.data || !response.data[0]) {
          throw new Error("Empty response from CRM.");
        }
        state.record = response.data[0];
        renderRecord(state.record);
        showMain();
      })
      .catch(function (err) {
        console.error("getRecord failed", err);
        showError("Couldn't load this contact from CRM. Check your connection and try again.");
      });
  }

  // ---- Rendering -------------------------------------------------------

  function renderRecord(record) {
    Object.keys(FIELD_MAP).forEach(function (apiName) {
      var el = els[FIELD_MAP[apiName]];
      el.value = record[apiName] || "";
    });

    var first = record.First_Name || "";
    var last = record.Last_Name || "";
    var fullName = (first + " " + last).trim() || "Unnamed contact";
    els.fullNameHeading.textContent = fullName;
    els.avatarInitials.textContent = initialsOf(first, last);

    clearAutofillMarks();
    setLookupStatus("", "");
  }

  function initialsOf(first, last) {
    var a = (first || "").trim().charAt(0);
    var b = (last || "").trim().charAt(0);
    var initials = (a + b).toUpperCase();
    return initials || "?";
  }

  function showLoading() {
    els.loadingState.classList.remove("hidden");
    els.errorState.classList.add("hidden");
    els.mainContent.classList.add("hidden");
  }

  function showError(message) {
    els.errorMessage.textContent = message;
    els.loadingState.classList.add("hidden");
    els.errorState.classList.remove("hidden");
    els.mainContent.classList.add("hidden");
  }

  function showMain() {
    els.loadingState.classList.add("hidden");
    els.errorState.classList.add("hidden");
    els.mainContent.classList.remove("hidden");
  }

  // ---- Edit mode ---------------------------------------------------------

  function enterEditMode() {
    state.editing = true;
    Object.keys(FIELD_MAP).forEach(function (apiName) {
      els[FIELD_MAP[apiName]].disabled = false;
    });
    els.lookupBtn.classList.remove("hidden");
    els.editActions.classList.remove("hidden");
    els.editBtn.classList.add("hidden");
    setStatusPill("editing", "Editing");
    els.saveHint.textContent = "";
    els.firstName.focus();
  }

  function exitEditMode() {
    state.editing = false;
    Object.keys(FIELD_MAP).forEach(function (apiName) {
      els[FIELD_MAP[apiName]].disabled = true;
      els[FIELD_MAP[apiName]].classList.remove("field-invalid");
    });
    els.lookupBtn.classList.add("hidden");
    els.editActions.classList.add("hidden");
    els.editBtn.classList.remove("hidden");
    clearAutofillMarks();
    setStatusPill("", "");
    setLookupStatus("", "");
    // Discard any unsaved edits by re-rendering the last known-good record.
    if (state.record) renderRecord(state.record);
  }

  // ---- Postal code -> city/state/country lookup --------------------------

  function runPostalLookup(rawValue) {
    var postal = (rawValue || "").trim();
    if (!postal) return;

    setLookupStatus("Looking up…", "");
    els.lookupBtn.disabled = true;

    var url = NOMINATIM_ENDPOINT +
      "?format=jsonv2&addressdetails=1&limit=1&postalcode=" + encodeURIComponent(postal);

    fetch(url, { headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (results) {
        els.lookupBtn.disabled = false;
        if (!results || !results.length) {
          setLookupStatus("No match for that postal code — fill in the rest manually.", "error");
          return;
        }
        var addr = results[0].address || {};
        var city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
        var region = addr.state || addr.region || "";
        var country = addr.country || "";

        if (city) markAutofilled(els.city, city);
        if (region) markAutofilled(els.state, region);
        if (country) markAutofilled(els.country, country);

        setLookupStatus("City / state / country filled in — double-check before saving.", "success");
      })
      .catch(function (err) {
        console.error("Postal lookup failed", err);
        els.lookupBtn.disabled = false;
        setLookupStatus("Lookup failed. You can enter the address manually.", "error");
      });
  }

  function markAutofilled(el, value) {
    el.value = value;
    el.classList.add("field-autofilled");
  }

  function clearAutofillMarks() {
    ADDRESS_LOOKUP_FIELDS.forEach(function (id) {
      els[id].classList.remove("field-autofilled");
    });
  }

  function setLookupStatus(text, kind) {
    els.lookupStatus.textContent = text;
    els.lookupStatus.className = "field-hint" + (kind ? " " + kind : "");
  }

  // ---- Save ----------------------------------------------------------------

  function onSave(evt) {
    evt.preventDefault();
    if (state.saving) return;

    if (!els.firstName.value.trim() || !els.lastName.value.trim()) {
      markInvalid(els.firstName, !els.firstName.value.trim());
      markInvalid(els.lastName, !els.lastName.value.trim());
      els.saveHint.textContent = "First and last name can't be empty.";
      return;
    }
    markInvalid(els.firstName, false);
    markInvalid(els.lastName, false);

    var payload = { id: state.recordId };
    Object.keys(FIELD_MAP).forEach(function (apiName) {
      payload[apiName] = els[FIELD_MAP[apiName]].value.trim();
    });

    setSaving(true);

    ZOHO.CRM.API.updateRecord({
      Entity: MODULE,
      APIData: payload,
      Trigger: ["workflow"]
    })
      .then(function (response) {
        var result = response && response.data && response.data[0];
        if (!result || result.code !== "SUCCESS") {
          var msg = (result && result.message) || "CRM rejected the update.";
          throw new Error(msg);
        }
        // Re-fetch from CRM (rather than trusting local state) so the
        // widget proves the values actually persisted, per the brief.
        return ZOHO.CRM.API.getRecord({ Entity: MODULE, RecordID: state.recordId });
      })
      .then(function (response) {
        state.record = response.data[0];
        renderRecord(state.record);
        exitEditModeAfterSave();
        setStatusPill("saved", "Saved");
        showToast("Contact updated.", "success");
      })
      .catch(function (err) {
        console.error("updateRecord failed", err);
        setStatusPill("error", "Save failed");
        els.saveHint.textContent = "Save failed — nothing was lost, try again.";
        showToast(String((err && err.message) || err), "error");
      })
      .finally(function () {
        setSaving(false);
      });
  }

  function markInvalid(el, isInvalid) {
    el.classList.toggle("field-invalid", !!isInvalid);
  }

  function exitEditModeAfterSave() {
    state.editing = false;
    Object.keys(FIELD_MAP).forEach(function (apiName) {
      els[FIELD_MAP[apiName]].disabled = true;
    });
    els.lookupBtn.classList.add("hidden");
    els.editActions.classList.add("hidden");
    els.editBtn.classList.remove("hidden");
    clearAutofillMarks();
    setLookupStatus("", "");
  }

  function setSaving(isSaving) {
    state.saving = isSaving;
    els.saveBtn.disabled = isSaving;
    els.cancelBtn.disabled = isSaving;
    els.saveBtn.querySelector(".btn-label").textContent = isSaving ? "Saving…" : "Save changes";
    els.saveBtn.querySelector(".btn-spinner").classList.toggle("hidden", !isSaving);
  }

  function setStatusPill(kind, text) {
    if (!text) {
      els.statusPill.classList.add("hidden");
      return;
    }
    els.statusPill.textContent = text;
    els.statusPill.className = "status-pill " + kind;
    els.statusPill.classList.remove("hidden");
  }

  var toastTimer = null;
  function showToast(message, kind) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.className = "toast" + (kind ? " " + kind : "");
    els.toast.classList.remove("hidden");
    toastTimer = setTimeout(function () {
      els.toast.classList.add("hidden");
    }, 3200);
  }
})();
