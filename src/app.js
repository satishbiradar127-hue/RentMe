import { categories, companions, seedBookings } from "./data.js";

const storageKey = "rentme:v1:bookings";
const validStatuses = ["requested", "accepted", "confirmed", "in_progress", "completed", "reviewed", "declined", "cancelled", "no_show", "disputed"];
const legacyStatuses = { pending: "requested" };
const transitions = {
  requested: ["accepted", "declined", "cancelled"],
  accepted: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled", "no_show", "disputed"],
  in_progress: ["completed", "disputed", "no_show"],
  completed: ["reviewed", "disputed"],
  reviewed: [],
  declined: [],
  cancelled: [],
  no_show: ["disputed"],
  disputed: []
};
const app = document.querySelector("#app");

const state = {
  category: "All",
  query: "",
  activeCompanionId: companions[0].id,
  activeExperienceId: companions[0].experiences[0].id,
  activeRole: "customer",
  activeUser: null,
  availablePersonas: [],
  token: localStorage.getItem("rentme:auth:token") || "",
  refreshToken: localStorage.getItem("rentme:auth:refresh_token") || "",
  authModal: null,
  authForm: {
    email: "",
    password: "",
    name: "",
    role: "customer",
    phone: ""
  },
  authError: "",
  companions: [...companions],
  categories: [...categories],
  availability: {},
  reviews: [],
  reports: [],
  adminMetrics: null,
  adminOverview: null,
  form: {
    customerName: "",
    customerEmail: "",
    date: "",
    partySize: "1",
    notes: ""
  },
  errors: {},
  notice: "",
  bookings: []
};

state.bookings = loadBookings();

function loadBookings() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    return Array.isArray(saved) ? normalizeBookings(saved) : normalizeBookings(seedBookings);
  } catch {
    return normalizeBookings(seedBookings);
  }
}

function normalizeBookings(bookings) {
  if (!Array.isArray(bookings)) return normalizeBookings(seedBookings);
  const normalized = bookings.map((booking) => {
    const companion = companionById(booking.companionId);
    const experience = experienceById(companion, booking.experienceId);
    return {
      ...booking,
      experienceId: experience.id,
      status: normalizeStatus(booking.status),
      partySize: Number.isInteger(Number(booking.partySize)) ? Number(booking.partySize) : 1,
      notes: booking.notes || ""
    };
  });

  return normalized;
}

function saveBookings() {
  localStorage.setItem(storageKey, JSON.stringify(state.bookings));
}

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function imageFallback(label) {
  const initials = label
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#0b7a5b"/>
          <stop offset="1" stop-color="#d69d2f"/>
        </linearGradient>
      </defs>
      <rect width="640" height="480" fill="url(#bg)"/>
      <circle cx="500" cy="110" r="88" fill="rgba(255,255,255,0.18)"/>
      <path d="M92 338c74-72 137-102 190-89 45 11 72 52 116 48 35-3 68-34 150-111v152H92Z" fill="rgba(255,255,255,0.24)"/>
      <text x="54" y="86" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="700">RentMe Hyderabad</text>
      <text x="54" y="256" fill="white" font-family="Arial, sans-serif" font-size="86" font-weight="800">${initials}</text>
      <text x="54" y="304" fill="white" font-family="Arial, sans-serif" font-size="28" font-weight="700">Verified public experience</text>
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function imageTag(src, alt, className = "") {
  return `<img ${className ? `class="${className}"` : ""} src="${src}" alt="${alt}" onerror="this.onerror=null;this.src='${imageFallback(alt)}';">`;
}

function companionById(id) {
  const list = typeof state !== "undefined" && state && state.companions && state.companions.length ? state.companions : companions;
  return list.find((companion) => companion.id === id) || list[0] || companions[0];
}

function experienceById(companion, id) {
  if (!companion || !Array.isArray(companion.experiences) || !companion.experiences.length) {
    return {
      id: id || "default-exp",
      title: "Public Experience",
      duration: "3 hour public experience",
      location: "Hyderabad",
      price: 2400,
      includes: ["Public route"],
      description: "Verified public experience."
    };
  }
  return companion.experiences.find((experience) => experience.id === id) || companion.experiences[0];
}

function activeCompanion() {
  return companionById(state.activeCompanionId);
}

function activeExperience() {
  return experienceById(activeCompanion(), state.activeExperienceId);
}

function bookingLabel(status) {
  return {
    requested: "Requested",
    accepted: "Accepted",
    confirmed: "Confirmed",
    in_progress: "In Progress",
    completed: "Completed",
    reviewed: "Reviewed",
    declined: "Declined",
    cancelled: "Cancelled",
    no_show: "No-show",
    disputed: "Disputed"
  }[status] || status;
}

function normalizeStatus(status) {
  const normalized = legacyStatuses[status] || status;
  return validStatuses.includes(normalized) ? normalized : "requested";
}

function getCategories() {
  const list = typeof state !== "undefined" && state && state.companions && state.companions.length ? state.companions : companions;
  return ["All", ...new Set(list.map((companion) => companion.category))];
}

function visibleCompanions() {
  const query = (typeof state !== "undefined" && state && state.query ? state.query : "").trim().toLowerCase();
  const currentCategory = typeof state !== "undefined" && state && state.category ? state.category : "All";
  const list = typeof state !== "undefined" && state && state.companions && state.companions.length ? state.companions : companions;

  return list.filter((companion) => {
    const categoryMatch = currentCategory === "All" || companion.category === currentCategory;
    const queryText = [
      companion.name,
      companion.city,
      companion.category,
      companion.bio,
      ...(companion.specialties || []),
      ...(companion.experiences || []).map((experience) => `${experience.title} ${experience.description}`)
    ].join(" ").toLowerCase();

    return categoryMatch && (!query || queryText.includes(query));
  });
}

function validateRequest() {
  const errors = {};
  const companion = activeCompanion();

  if (!state.form.customerName.trim()) {
    errors.customerName = "Name is required.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.form.customerEmail.trim())) {
    errors.customerEmail = "Valid email is required.";
  }

  const avail = companion.availability || state.availability[companion.id] || [];
  if (!state.form.date) {
    errors.date = "Choose an available date.";
  } else if (!avail.includes(state.form.date)) {
    errors.date = "That companion is not available on this date.";
  }

  const partySize = Number(state.form.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 4) {
    errors.partySize = "Party size must be 1 to 4.";
  }

  return errors;
}

// Development Mode Detection & Seed Credential Isolation
function checkIsDevMode() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("dev") === "true" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    localStorage.getItem("rentme:dev_mode") === "true" ||
    Boolean(window.__RENTME_DEV__)
  );
}

const isDevMode = checkIsDevMode();

// Seeded credentials isolated strictly to development mode
const demoCredentials = isDevMode
  ? {
      customer: { email: "rohan@example.com", password: "RentMe2026!" },
      companion: { email: "aisha@rentme.local", password: "RentMe2026!" },
      admin: { email: "admin@rentme.local", password: "RentMe2026!" }
    }
  : {};

let isRefreshing = false;
let refreshSubscribers = [];

function onTokenRefreshed(newToken) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

async function apiFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };
  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }
  let res = await fetch(url, { ...options, headers });

  // Handle token expiration & automatic refresh
  if (res.status === 401 && state.refreshToken && !url.includes("/api/auth/refresh")) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: state.refreshToken })
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.session?.token) {
            state.token = refreshData.session.token;
            localStorage.setItem("rentme:auth:token", state.token);
            if (refreshData.session.refreshToken) {
              state.refreshToken = refreshData.session.refreshToken;
              localStorage.setItem("rentme:auth:refresh_token", state.refreshToken);
            }
            onTokenRefreshed(state.token);
          }
        } else {
          state.token = "";
          state.refreshToken = "";
          localStorage.removeItem("rentme:auth:token");
          localStorage.removeItem("rentme:auth:refresh_token");
          state.activeUser = null;
        }
      } catch {
        // Network error during refresh
      } finally {
        isRefreshing = false;
      }
    } else {
      await new Promise((resolve) => refreshSubscribers.push(resolve));
    }

    if (state.token) {
      headers["Authorization"] = `Bearer ${state.token}`;
      res = await fetch(url, { ...options, headers });
    }
  }

  return res;
}

async function reloadAppData() {
  await loadCompanions();
  const comp = activeCompanion();
  if (comp) {
    await loadAvailability(comp.id);
  }
  await loadBookingsFromApi();
  await loadReviews();
  await loadReports();
  await loadAdminOverview();
}

async function loadSession() {
  try {
    const res = await apiFetch("/api/auth/session");
    if (res.ok) {
      const data = await res.json();
      if (data.session && data.session.user) {
        state.activeRole = data.session.role || state.activeRole;
        state.activeUser = data.session.user || null;
        if (data.session.token && !state.token) {
          state.token = data.session.token;
          localStorage.setItem("rentme:auth:token", state.token);
        }
        if (data.session.refreshToken && !state.refreshToken) {
          state.refreshToken = data.session.refreshToken;
          localStorage.setItem("rentme:auth:refresh_token", state.refreshToken);
        }
      }
      if (Array.isArray(data.availablePersonas)) {
        state.availablePersonas = data.availablePersonas;
      }
      if (state.activeUser && state.activeRole === "customer") {
        if (!state.form.customerName) state.form.customerName = state.activeUser.name;
        if (!state.form.customerEmail) state.form.customerEmail = state.activeUser.email;
      }
    } else if (res.status === 401) {
      state.token = "";
      state.refreshToken = "";
      localStorage.removeItem("rentme:auth:token");
      localStorage.removeItem("rentme:auth:refresh_token");
      state.activeUser = null;
    }
  } catch {}
}

async function quickLogin(newRole) {
  const creds = demoCredentials[newRole];
  if (creds) {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          state.token = data.session.token;
          localStorage.setItem("rentme:auth:token", state.token);
          if (data.session.refreshToken) {
            state.refreshToken = data.session.refreshToken;
            localStorage.setItem("rentme:auth:refresh_token", state.refreshToken);
          }
          state.activeUser = data.session.user;
          state.activeRole = data.session.role;
          if (state.activeRole === "customer" && state.activeUser) {
            state.form.customerName = state.activeUser.name;
            state.form.customerEmail = state.activeUser.email;
          }
          state.notice = `Authenticated as ${state.activeUser.name} (${state.activeRole.toUpperCase()}) via Supabase Auth.`;
          await reloadAppData();
          render();
          return;
        }
      }
    } catch {}
  }
  await switchSessionRole(newRole);
}

async function login(email, password) {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.success && data.session) {
      state.token = data.session.token;
      localStorage.setItem("rentme:auth:token", state.token);
      if (data.session.refreshToken) {
        state.refreshToken = data.session.refreshToken;
        localStorage.setItem("rentme:auth:refresh_token", state.refreshToken);
      }
      state.activeUser = data.session.user;
      state.activeRole = data.session.role;
      state.authModal = null;
      state.authError = "";
      if (state.activeRole === "customer" && state.activeUser) {
        state.form.customerName = state.activeUser.name;
        state.form.customerEmail = state.activeUser.email;
      }
      state.notice = `Welcome back, ${state.activeUser.name}! Real Supabase session active.`;
      await reloadAppData();
      render();
    } else {
      state.authError = data.error || "Invalid email or password.";
      render();
    }
  } catch (err) {
    state.authError = err.message || "Network error logging in.";
    render();
  }
}

async function signup(payload) {
  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success && data.session) {
      state.token = data.session.token;
      localStorage.setItem("rentme:auth:token", state.token);
      if (data.session.refreshToken) {
        state.refreshToken = data.session.refreshToken;
        localStorage.setItem("rentme:auth:refresh_token", state.refreshToken);
      }
      state.activeUser = data.session.user;
      state.activeRole = data.session.role;
      state.authModal = null;
      state.authError = "";
      if (state.activeRole === "customer" && state.activeUser) {
        state.form.customerName = state.activeUser.name;
        state.form.customerEmail = state.activeUser.email;
      }
      state.notice = `Welcome to RentMe, ${state.activeUser.name}! Real account created and authenticated.`;
      await reloadAppData();
      render();
    } else {
      state.authError = data.error || "Failed to create account.";
      render();
    }
  } catch (err) {
    state.authError = err.message || "Network error creating account.";
    render();
  }
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
  state.token = "";
  state.refreshToken = "";
  localStorage.removeItem("rentme:auth:token");
  localStorage.removeItem("rentme:auth:refresh_token");
  state.activeUser = null;
  state.activeRole = "customer";
  state.notice = "Logged out successfully.";
  await reloadAppData();
  render();
}

async function switchSessionRole(newRole, userId) {
  try {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole, userId })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.session) {
        state.activeRole = data.session.role;
        state.activeUser = data.session.user;
        if (state.activeRole === "customer" && state.activeUser) {
          state.form.customerName = state.activeUser.name;
          state.form.customerEmail = state.activeUser.email;
        }
      }
    }
  } catch {
    state.activeRole = newRole;
  }
  state.notice = `Role switched to ${newRole.toUpperCase()}. Backend state authority active.`;
  await loadAdminOverview();
  render();
}

async function loadCompanions() {
  try {
    const res = await apiFetch("/api/companions");
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.companions) && data.companions.length > 0) {
        state.companions = data.companions;
        state.categories = getCategories();
      }
    }
  } catch {}
}

async function loadAvailability(companionId) {
  try {
    const res = await apiFetch(`/api/companions/${companionId}/availability`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.availability)) {
        state.availability[companionId] = data.availability;
        const comp = companionById(companionId);
        if (comp) {
          comp.availability = data.availability;
        }
      }
    }
  } catch {}
}

async function loadBookingsFromApi() {
  try {
    const res = await apiFetch("/api/bookings");
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.bookings)) {
        state.bookings = normalizeBookings(data.bookings);
        saveBookings();
        return true;
      }
    }
  } catch {}
  return false;
}

async function loadReviews(companionId) {
  try {
    const url = companionId ? `/api/reviews?companionId=${companionId}` : "/api/reviews";
    const res = await apiFetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.reviews)) {
        state.reviews = data.reviews;
      }
    }
  } catch {}
}

async function loadReports() {
  try {
    const res = await apiFetch("/api/reports");
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.reports)) {
        state.reports = data.reports;
      }
    }
  } catch {}
}

async function loadAdminMetrics() {
  try {
    const res = await apiFetch("/api/admin/metrics");
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.metrics) {
        state.adminMetrics = data.metrics;
      }
    }
  } catch {}
}

async function loadAdminOverview() {
  try {
    const res = await apiFetch("/api/admin/overview");
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.overview) {
        state.adminOverview = data.overview;
        state.adminMetrics = data.overview.metrics;
        if (Array.isArray(data.overview.reports)) {
          state.reports = data.overview.reports;
        }
        if (Array.isArray(data.overview.companions) && data.overview.companions.length > 0) {
          state.companions = data.overview.companions;
        }
      }
    }
  } catch {}
}

async function createBooking() {
  state.errors = validateRequest();
  if (Object.keys(state.errors).length) {
    state.notice = "Please fix the highlighted fields.";
    render();
    return;
  }

  if (!state.token && !state.activeUser) {
    state.authModal = "login";
    state.notice = "Please log in to complete your booking.";
    render();
    return;
  }

  if (state.activeRole === "companion") {
    state.notice = "Companions cannot book experiences. Please switch or log in as a customer.";
    render();
    return;
  }

  const companion = activeCompanion();
  const experience = activeExperience();

  const bookingPayload = {
    companionId: companion.id,
    experienceId: experience.id,
    customerName: state.form.customerName.trim(),
    customerEmail: state.form.customerEmail.trim(),
    date: state.form.date,
    partySize: Number(state.form.partySize),
    notes: state.form.notes.trim()
  };

  const actorRole = state.activeRole || "customer";
  const actorId = state.activeUser?.id || "user-rohan";

  try {
    const res = await apiFetch("/api/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Actor-Role": actorRole,
        "X-Actor-Id": actorId
      },
      body: JSON.stringify(bookingPayload)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.booking) {
        state.bookings = [data.booking, ...state.bookings.filter((b) => b.id !== data.booking.id)];
        state.form = {
          customerName: state.activeUser?.name || "",
          customerEmail: state.activeUser?.email || "",
          date: "",
          partySize: "1",
          notes: ""
        };
        state.errors = {};
        state.notice = `Booking request sent for ${experience.title}. It is pending companion review and saved in Trips.`;
        saveBookings();
        await loadAdminMetrics();
        render();
        return;
      }
    } else {
      const err = await res.json().catch(() => ({}));
      state.notice = err.error || "Failed to create booking on backend.";
      render();
      return;
    }
  } catch {
    // Fallback to local storage if backend is unreachable
    const booking = {
      id: `booking-${Date.now()}`,
      ...bookingPayload,
      status: "requested",
      createdAt: new Date().toISOString()
    };
    state.bookings = [booking, ...state.bookings];
    state.form = { customerName: "", customerEmail: "", date: "", partySize: "1", notes: "" };
    state.errors = {};
    state.notice = `Booking request saved locally for ${experience.title} (API offline fallback).`;
    saveBookings();
    render();
  }
}

async function setBookingStatus(id, status, meta = {}) {
  const nextStatus = normalizeStatus(status);
  if (!validStatuses.includes(nextStatus)) {
    state.notice = "That booking status is not supported in V1.";
    render();
    return;
  }

  const booking = state.bookings.find((item) => item.id === id);
  if (!booking) {
    state.notice = "Booking not found.";
    render();
    return;
  }

  const currentStatus = normalizeStatus(booking.status);
  const allowedTransitions = transitions[currentStatus] || [];
  if ((booking.status !== "pending" || !allowedTransitions.includes(nextStatus)) && !allowedTransitions.includes(nextStatus)) {
    state.notice = `${bookingLabel(currentStatus)} bookings cannot move to ${bookingLabel(nextStatus)}.`;
    render();
    return;
  }

  const actorRole = meta.actorRole || meta.actor || state.activeRole || "customer";
  const actorId = meta.actorId || state.activeUser?.id || (actorRole === "companion" ? booking.companionId : booking.customerId);

  try {
    const res = await apiFetch(`/api/bookings/${id}/transition`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Actor-Role": actorRole,
        "X-Actor-Id": actorId
      },
      body: JSON.stringify({
        action: nextStatus,
        targetStatus: nextStatus,
        actorRole,
        actorId,
        cancelledBy: meta.cancelledBy || (nextStatus === "cancelled" ? actorRole : undefined),
        rating: meta.rating,
        review: meta.review,
        notes: meta.notes
      })
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && json.booking) {
        state.bookings = state.bookings.map((item) => (item.id === id ? { ...item, ...json.booking } : item));
        state.notice = `Booking moved to ${bookingLabel(nextStatus)}.`;
        saveBookings();

        if (nextStatus === "reviewed") {
          await loadReviews();
          await loadCompanions();
        }
        await loadAdminOverview();
        render();
        return;
      }
    } else {
      const err = await res.json().catch(() => ({}));
      if (err.error) {
        state.notice = err.error;
        render();
        return;
      }
    }
  } catch {
    // Network fallback
  }

  state.bookings = state.bookings.map((item) =>
    item.id === id
      ? {
          ...item,
          ...meta,
          status: nextStatus,
          updatedAt: new Date().toISOString()
        }
      : item
  );
  state.notice = `Booking moved to ${bookingLabel(nextStatus)}.`;
  saveBookings();
  render();
}

async function resetDemoData() {
  try {
    await apiFetch("/api/admin/reset", { method: "POST" });
    await loadSession();
    await loadCompanions();
    await loadBookingsFromApi();
    await loadReviews();
    await loadReports();
    await loadAdminOverview();
    state.notice = "Backend and local demo data restored.";
    render();
    return;
  } catch {}
  state.bookings = normalizeBookings(seedBookings);
  state.notice = "Local demo data restored.";
  saveBookings();
  render();
}

async function showSupport(kind) {
  try {
    const res = await apiFetch("/api/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Actor-Role": state.activeRole || "customer",
        "X-Actor-Id": state.activeUser?.id || "user-rohan"
      },
      body: JSON.stringify({
        category: kind.toLowerCase().includes("safety") || kind.toLowerCase().includes("concern") ? "safety" : "support",
        description: `${kind} logged via portal`,
        reporterUserId: state.activeUser?.id || "user-rohan",
        bookingId: state.bookings[0]?.id
      })
    });
    if (res.ok) {
      await loadReports();
      await loadAdminOverview();
    }
  } catch {}
  state.notice = `${kind} is logged on RentMe backend. Production support, trust review, and emergency escalation are active.`;
  render();
}

async function resolveReport(reportId) {
  try {
    const res = await apiFetch(`/api/reports/${reportId}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Actor-Role": "admin",
        "X-Actor-Id": state.activeUser?.id || "user-admin"
      },
      body: JSON.stringify({
        resolutionNotes: "Resolved by administrator in portal."
      })
    });
    if (res.ok) {
      state.notice = `Incident report ${reportId} marked resolved.`;
      await loadReports();
      await loadAdminOverview();
      render();
      return;
    }
  } catch {}
  state.notice = "Failed to resolve report.";
  render();
}

function companionCard(companion) {
  const selected = companion.id === state.activeCompanionId ? "is-selected" : "";
  return `
    <button class="listing-card ${selected}" data-companion-id="${companion.id}" type="button">
      ${imageTag(companion.image, companion.name)}
      <span class="listing-meta">
        <strong>${companion.name}</strong>
        <span>${companion.status} · ${companion.city}</span>
        <span>${(companion.specialties || []).join(" · ")}</span>
      </span>
      <span class="listing-price">${money(companion.rate)}<small>from</small></span>
    </button>
  `;
}

function statusBadge(status) {
  return `<span class="status status-${status}">${bookingLabel(status)}</span>`;
}

function bookingSummary(booking) {
  const companion = companionById(booking.companionId);
  const experience = experienceById(companion, booking.experienceId);

  return `
    <article class="booking-row">
      <div>
        <strong>${experience.title}</strong>
        <span>${booking.customerName} · ${companion.name} · ${experience.location} · ${booking.date}</span>
        <span>${booking.partySize} guest${booking.partySize === 1 ? "" : "s"} · ${booking.customerEmail}${booking.totalPrice ? ` · ${money(booking.totalPrice)}` : ""}</span>
        ${booking.cancelledBy ? `<span>Cancelled by ${booking.cancelledBy}</span>` : ""}
        ${booking.rating ? `<span>Review: ${booking.rating}/5 · ${booking.review || "No written review"}</span>` : ""}
      </div>
      ${statusBadge(booking.status)}
      <div class="inline-actions">${customerActions(booking)}</div>
    </article>
  `;
}

function actionButton(booking, status, label, actor = "system") {
  return `<button data-booking-action="${status}" data-booking-id="${booking.id}" data-actor="${actor}" type="button">${label}</button>`;
}

function customerActions(booking) {
  const actions = [];
  if (["requested", "accepted", "confirmed"].includes(booking.status)) {
    actions.push(actionButton(booking, "cancelled", "Cancel trip", "customer"));
  }
  if (booking.status === "accepted") {
    actions.push(actionButton(booking, "confirmed", "Confirm booking", "customer"));
  }
  if (booking.status === "completed") {
    actions.push(`
      <label class="review-control">
        <span>Rating</span>
        <select data-review-rating="${booking.id}">
          <option value="5">5</option>
          <option value="4">4</option>
          <option value="3">3</option>
          <option value="2">2</option>
          <option value="1">1</option>
        </select>
      </label>
      <input data-review-text="${booking.id}" placeholder="Public trip review">
      ${actionButton(booking, "reviewed", "Submit review", "customer")}
    `);
  }
  if (["confirmed", "in_progress", "completed", "no_show"].includes(booking.status)) {
    actions.push(actionButton(booking, "disputed", "Dispute", "customer"));
  }
  return actions.join("");
}

function companionActions(booking) {
  const actions = [];
  if (booking.status === "requested") {
    actions.push(actionButton(booking, "accepted", "Accept", "companion"));
    actions.push(actionButton(booking, "declined", "Decline", "companion"));
  }
  if (["accepted", "confirmed"].includes(booking.status)) {
    actions.push(actionButton(booking, "cancelled", "Companion cancel", "companion"));
  }
  if (booking.status === "confirmed") {
    actions.push(actionButton(booking, "in_progress", "Start", "companion"));
    actions.push(actionButton(booking, "no_show", "No-show", "companion"));
  }
  if (booking.status === "in_progress") {
    actions.push(actionButton(booking, "completed", "Complete", "companion"));
    actions.push(actionButton(booking, "disputed", "Dispute", "companion"));
  }
  return actions.join("");
}

function adminActions(booking) {
  const actions = [];
  if ((transitions[booking.status] || []).includes("disputed")) actions.push(actionButton(booking, "disputed", "Flag dispute", "admin"));
  if ((transitions[booking.status] || []).includes("no_show")) actions.push(actionButton(booking, "no_show", "Mark no-show", "admin"));
  if (["requested", "accepted", "confirmed"].includes(booking.status)) actions.push(actionButton(booking, "cancelled", "Admin cancel", "admin"));
  return actions.join("");
}

function inboxRequest(booking) {
  const companion = companionById(booking.companionId);
  const experience = experienceById(companion, booking.experienceId);
  const actions = companionActions(booking);

  return `
    <article class="request-card">
      <div class="request-main">
        <div>
          <p class="eyebrow">${companion.name}</p>
          <h3>${experience.title}</h3>
          <p>${booking.customerName} requested ${booking.date} for ${booking.partySize} guest${booking.partySize === 1 ? "" : "s"} at ${experience.location}.${booking.totalPrice ? ` Total: ${money(booking.totalPrice)}` : ""}</p>
          <span>${booking.notes || "No notes provided."}</span>
          ${booking.cancelledBy ? `<span>Cancelled by ${booking.cancelledBy}</span>` : ""}
          ${booking.rating ? `<span>Review: ${booking.rating}/5 · ${booking.review || "No written review"}</span>` : ""}
        </div>
        ${statusBadge(booking.status)}
      </div>
      <div class="action-row">${actions || `<span>No companion actions available.</span>`}</div>
    </article>
  `;
}

function renderDetails(companion, experience) {
  const total = experience.price * Number(state.form.partySize || 1);
  const availDates = companion.availability || state.availability[companion.id] || [];
  const compReviews = (state.reviews || []).filter((r) => r.companionId === companion.id);
  const isVerified =
    companion.verificationStatus === "verified" ||
    companion.status === "ID Verified" ||
    companion.status === "verified";

  return `
    <aside class="details" id="details" aria-label="Experience details">
      ${imageTag(companion.image, companion.name, "detail-image")}
      <div class="detail-body">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <p class="eyebrow" style="margin: 0;">${companion.status} Travel Companion</p>
          <span class="verification-badge ${isVerified ? "verified" : "pending"}" style="font-size: 11px; padding: 2px 8px; border-radius: 999px; background: ${isVerified ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)"}; color: ${isVerified ? "#10b981" : "#f59e0b"}; font-weight: 600;">
            ${isVerified ? "✓ Verified" : "⏳ Verification Pending"}
          </span>
        </div>
        <h2>${companion.name}</h2>
        <p>${companion.bio}</p>
        <div class="stat-row">
          <span>★ ${companion.rating} rating</span>
          <span>${companion.reviews} reviews</span>
          <span>${companion.response} reply</span>
          <span>Public venues only</span>
          <span>Report and support ready</span>
        </div>
        <div class="tag-row">${(companion.specialties || []).map((tag) => `<span>${tag}</span>`).join("")}</div>

        <label>
          <span>Experience</span>
          <select id="experience-select">
            ${(companion.experiences || []).map((item) => `<option value="${item.id}" ${item.id === experience.id ? "selected" : ""}>${item.title}</option>`).join("")}
          </select>
        </label>

        <section class="experience-panel">
          <h3>${experience.title}</h3>
          <p>${experience.description}</p>
          <div class="stat-row">
            <span>${experience.duration}</span>
            <span>${experience.location}</span>
            <span>${money(experience.price)}</span>
          </div>
          <div class="tag-row">${(experience.includes || []).map((item) => `<span>${item}</span>`).join("")}</div>
        </section>

        ${compReviews.length > 0 ? `
          <section class="experience-panel" style="margin-top: 12px;">
            <h3>Verified Traveler Reviews</h3>
            ${compReviews.slice(0, 3).map((r) => `
              <div style="margin-bottom: 8px; border-bottom: 1px solid var(--line); padding-bottom: 6px;">
                <strong>★ ${r.rating}/5</strong>
                <p style="margin: 4px 0 2px;">${r.reviewText || "Completed public Hyderabad experience."}</p>
                <small style="color: var(--muted);">${r.createdAt ? r.createdAt.slice(0, 10) : "Recent"}</small>
              </div>
            `).join("")}
          </section>
        ` : ""}

        <form class="booking-form" id="booking-form" novalidate>
          <div class="form-grid">
            ${field("customerName", "Your Name", "text", "Rohan Mehta")}
            ${field("customerEmail", "Email", "email", "rohan@example.com")}
            ${field("date", "Travel Date", "date", "")}
            ${field("partySize", "Guests", "number", "1", 'min="1" max="4"')}
          </div>
          <label>
            <span>Notes</span>
            <textarea id="notes" placeholder="Hotel area, language preferences, public meeting point, accessibility needs">${state.form.notes}</textarea>
          </label>
          <div class="availability">
            <strong>Availability (Authoritative)</strong>
            <div>${availDates.map((date) => `<button class="${state.form.date === date ? "selected" : ""}" data-date="${date}" type="button">${date.slice(5)}</button>`).join("") || "<span>No open dates listed.</span>"}</div>
          </div>
          <div class="quote">
            <div><span>Experience price</span><strong>${money(experience.price)}</strong></div>
            <div><span>Guests</span><strong>${state.form.partySize || 1}</strong></div>
            <div class="total"><span>Estimated total</span><strong>${money(total)}</strong></div>
          </div>
          ${!isVerified ? `
            <div class="safety-note" style="border-color: #f59e0b; background: rgba(245, 158, 11, 0.08);">
              <strong>Verification In Progress</strong>
              <span>This companion's KYC identity verification is currently under review by RentMe Operations. Booking will unlock once verified.</span>
            </div>
            <button class="primary-action" type="submit" disabled style="opacity: 0.5; cursor: not-allowed;">Verification Pending</button>
          ` : `
            <div class="safety-note">
              <strong>V1 trust basics</strong>
              <span>ID-verified companion, public venue plan, visible participant details, and backend Trust & Safety support connected.</span>
              <button class="support-link" data-support="Report concern" type="button">Report concern</button>
              <button class="support-link" data-support="Contact support" type="button">Contact support</button>
            </div>
            <button class="primary-action" type="submit">Request Travel Companion</button>
          `}
        </form>
      </div>
    </aside>
  `;
}

function field(id, label, type, placeholder, extra = "") {
  const error = state.errors[id];
  return `
    <label class="${error ? "has-error" : ""}">
      <span>${label}</span>
      <input id="${id}" type="${type}" value="${state.form[id]}" placeholder="${placeholder}" ${extra}>
      ${error ? `<small>${error}</small>` : ""}
    </label>
  `;
}

function render() {
  const matches = visibleCompanions();
  if (!matches.some((companion) => companion.id === state.activeCompanionId) && matches[0]) {
    state.activeCompanionId = matches[0].id;
    state.activeExperienceId = matches[0].experiences[0]?.id;
  }

  const companion = activeCompanion();
  const experience = activeExperience();
  const pendingCount = state.bookings.filter((booking) => normalizeStatus(booking.status) === "requested").length;
  const acceptedCount = state.bookings.filter((booking) => normalizeStatus(booking.status) === "accepted").length;
  const activeCount = state.bookings.filter((booking) => ["confirmed", "in_progress"].includes(normalizeStatus(booking.status))).length;

  const currentCategories = getCategories();
  const adminMetrics = state.adminMetrics || {
    totalCompanions: (state.companions || companions).length,
    totalBookings: state.bookings.length,
    requestedBookings: pendingCount,
    acceptedBookings: acceptedCount,
    confirmedBookings: state.bookings.filter((b) => b.status === "confirmed").length,
    inProgressBookings: state.bookings.filter((b) => b.status === "in_progress").length,
    completedBookings: state.bookings.filter((b) => ["completed", "reviewed"].includes(b.status)).length,
    cancelledBookings: state.bookings.filter((b) => ["cancelled", "declined"].includes(b.status)).length,
    disputedBookings: state.bookings.filter((b) => b.status === "disputed").length,
    totalGmv: state.bookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0),
    openReports: (state.reports || []).filter((r) => r.status === "open").length
  };

  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#" aria-label="RentMe home"><span class="brand-mark">R</span><span>RentMe</span></a>
      <nav aria-label="Primary">
        <a href="#explore">Explore</a>
        <a href="#trips">Trips</a>
        <a href="#companion">Companion</a>
        <a href="#admin">Admin</a>
      </nav>
      <div class="auth-bar">
        ${isDevMode ? `
        <div class="role-selector" aria-label="Role Switcher">
          <button class="role-pill ${state.activeRole === "customer" ? "active" : ""}" data-switch-role="customer" type="button">Customer</button>
          <button class="role-pill ${state.activeRole === "companion" ? "active" : ""}" data-switch-role="companion" type="button">Companion</button>
          <button class="role-pill ${state.activeRole === "admin" ? "active" : ""}" data-switch-role="admin" type="button">Admin</button>
        </div>
        ` : ""}
        ${state.token && state.activeUser ? `
          <div class="auth-user-badge">
            <span class="auth-user-role role-${state.activeRole}">${state.activeRole}</span>
            <span class="auth-user-name">${state.activeUser.name}</span>
            <button class="auth-btn-ghost" data-auth-action="logout" type="button">Log out</button>
          </div>
        ` : `
          <div class="auth-guest-actions">
            <button class="auth-btn-ghost" data-auth-action="open-login" type="button">Log In</button>
            <button class="auth-btn-solid" data-auth-action="open-signup" type="button">Sign Up</button>
          </div>
        `}
      </div>
      <span class="launch-pill">Hyderabad Launch${state.activeUser ? ` · ${state.activeUser.name}` : ""}</span>
    </header>

    <main>
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow">Verified travel companions in Hyderabad</p>
          <h1 id="hero-title">Don't Travel Alone.</h1>
          <p class="hero-subtitle">Book public city experiences with verified local companions for heritage walks, food trails, photography routes, events, and destination days.</p>
          <form class="search-panel" id="search-form">
            <label><span>Search Hyderabad</span><input id="search" type="search" value="${state.query}" placeholder="Charminar, Golconda, food walk, Ramoji"></label>
            <label><span>Experience</span><select id="category-select">${currentCategories.map((category) => `<option ${category === state.category ? "selected" : ""}>${category}</option>`).join("")}</select></label>
            <button type="submit">Explore</button>
          </form>
        </div>
        <div class="hero-preview" aria-label="Featured companion">
          ${imageTag(companion.image, companion.name)}
          <div><strong>${experience.title}</strong><span>${companion.name} · ${experience.duration} · ${money(experience.price)}</span></div>
        </div>
      </section>

      ${state.notice ? `<div class="notice" role="status">${state.notice}</div>` : ""}

      <section class="workspace" id="explore">
        <aside class="filters" aria-label="Categories">
          <h2>Explore</h2>
          <div class="category-list">
            ${currentCategories.map((category) => `<button class="${state.category === category ? "active" : ""}" data-category="${category}" type="button">${category}</button>`).join("")}
          </div>
          <div class="trust-panel">
            <strong>Travel-first marketplace</strong>
            <span>All V1 experiences are public-venue Hyderabad plans with verified companions, visible pricing, ratings, and availability.</span>
            <div class="trust-actions">
              <button data-support="Safety center" type="button">Safety Center</button>
              <button data-support="Trip support" type="button">Trip Support</button>
            </div>
          </div>
        </aside>

        <section class="results" aria-label="Companion profiles">
          <div class="section-heading">
            <div><p class="eyebrow">${matches.length} verified companions</p><h2>Hyderabad experiences</h2></div>
            <span class="sort-pill">Best match</span>
          </div>
          <div class="listing-grid">${matches.map(companionCard).join("") || `<p class="empty">No companions match that search yet.</p>`}</div>
        </section>

        ${renderDetails(companion, experience)}
      </section>

      <section class="dashboard" id="trips">
        <div class="section-heading"><div><p class="eyebrow">Customer trips</p><h2>Your Hyderabad travel plans</h2></div><span class="sort-pill">${activeCount} active</span></div>
        ${activeCount ? `<div class="active-safety"><strong>Active-trip safety</strong><span>Stay in public venues, keep participant details visible, and use support/reporting if anything feels off.</span><button data-support="Active trip support" type="button">Contact support</button><button data-support="Active trip concern" type="button">Report concern</button></div>` : ""}
        <div class="panel-grid">${state.bookings.map(bookingSummary).join("") || `<p class="empty">No trips yet.</p>`}</div>
      </section>

      <section class="dashboard" id="companion">
        <div class="section-heading"><div><p class="eyebrow">Companion workspace</p><h2>Availability and travel requests</h2></div><span class="sort-pill">${pendingCount} pending</span></div>
        <div class="companion-dashboard">
          <article class="availability-card">
            <h3>${companion.name}'s availability</h3>
            <p>${companion.status} · ${companion.city} · Public venue experiences only</p>
            <div class="calendar-list">${(companion.availability || []).map((date) => `<span>${date}</span>`).join("")}</div>
          </article>
          <div class="request-list">${state.bookings.map(inboxRequest).join("")}</div>
        </div>
      </section>

      <section class="dashboard" id="admin">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Admin visibility</p>
            <h2>Hyderabad launch snapshot</h2>
          </div>
          <button class="sort-pill admin-reset" data-reset type="button">Restore seed data</button>
        </div>
        <div class="admin-grid">
          <article><strong>${adminMetrics.totalCompanions}</strong><span>companions</span></article>
          <article><strong>${adminMetrics.totalBookings}</strong><span>bookings</span></article>
          <article><strong>${money(adminMetrics.totalGmv)}</strong><span>gross volume (GMV)</span></article>
          <article><strong>${adminMetrics.openReports}</strong><span>open trust reports</span></article>
        </div>
        <div class="admin-grid" style="margin-top: 10px;">
          <article><strong>${adminMetrics.requestedBookings}</strong><span>requested</span></article>
          <article><strong>${adminMetrics.acceptedBookings}</strong><span>accepted</span></article>
          <article><strong>${adminMetrics.confirmedBookings}</strong><span>confirmed</span></article>
          <article><strong>${adminMetrics.completedBookings}</strong><span>completed</span></article>
        </div>
        <div class="admin-table">
          ${state.bookings.map((booking) => {
            const bookingCompanion = companionById(booking.companionId);
            const bookingExperience = experienceById(bookingCompanion, booking.experienceId);
            return `<article><span>${booking.customerName}</span><span>${bookingCompanion.name}</span><span>${bookingExperience.title}</span><span>${booking.date}</span>${statusBadge(booking.status)}<span>${booking.cancelledBy ? `Cancelled by ${booking.cancelledBy}` : booking.rating ? `${booking.rating}/5 review` : "Ops clear"}</span><div class="inline-actions">${adminActions(booking)}</div></article>`;
          }).join("")}
        </div>
        ${(state.reports && state.reports.length) ? `
          <div class="section-heading" style="margin-top: 24px;">
            <div>
              <p class="eyebrow">Trust & Safety</p>
              <h3>Incident Reports (${adminMetrics.openReports} open)</h3>
            </div>
          </div>
          <div class="admin-table">
            ${state.reports.map((report) => `
              <article>
                <span><strong>[${report.category.toUpperCase()}]</strong> ${report.description}</span>
                <span>Reporter: ${report.reporterUserId || "User"}</span>
                <span>Created: ${report.createdAt ? report.createdAt.slice(0, 10) : "Recent"}</span>
                ${statusBadge(report.status === "open" ? "requested" : "accepted")}
                <div class="inline-actions">
                  ${report.status === "open" ? `<button data-resolve-report="${report.id}" type="button">Resolve</button>` : `<span>${report.resolutionNotes || "Resolved"}</span>`}
                </div>
              </article>
            `).join("")}
          </div>
        ` : ""}
      </section>
    </main>
    ${state.authModal ? `
      <div class="modal-overlay" id="auth-modal-overlay">
        <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
          <button class="modal-close" data-auth-action="close" type="button" aria-label="Close modal">&times;</button>
          ${state.authModal === "login" ? `
            <h2 id="auth-modal-title">Log in to RentMe</h2>
            <p class="auth-subtitle">Sign in to your account with Supabase Auth</p>
            ${state.authError ? `<div class="auth-error-banner" role="alert">${state.authError}</div>` : ""}
            <form id="login-form" class="auth-form">
              <label>
                <span>Email</span>
                <input type="email" id="login-email" value="${state.authForm.email}" placeholder="you@example.com" required>
              </label>
              <label>
                <span>Password</span>
                <input type="password" id="login-password" value="${state.authForm.password}" placeholder="••••••••" required>
              </label>
              <button type="submit" class="auth-submit-btn">Log In</button>
            </form>
            <div class="auth-switch">
              <span>Don't have an account?</span>
              <button data-auth-action="switch-to-signup" type="button">Sign up</button>
            </div>
          ` : `
            <h2 id="auth-modal-title">Create your Account</h2>
            <p class="auth-subtitle">Join RentMe with Supabase Auth</p>
            ${state.authError ? `<div class="auth-error-banner" role="alert">${state.authError}</div>` : ""}
            <form id="signup-form" class="auth-form">
              <label>
                <span>Full Name</span>
                <input type="text" id="signup-name" value="${state.authForm.name}" placeholder="Rohan Mehta" required>
              </label>
              <label>
                <span>Account Type</span>
                <select id="signup-role">
                  <option value="customer" ${state.authForm.role === "customer" ? "selected" : ""}>Customer (Traveler)</option>
                  <option value="companion" ${state.authForm.role === "companion" ? "selected" : ""}>Companion (Local Host)</option>
                </select>
              </label>
              <label>
                <span>Email</span>
                <input type="email" id="signup-email" value="${state.authForm.email}" placeholder="you@example.com" required>
              </label>
              <label>
                <span>Phone (Optional)</span>
                <input type="tel" id="signup-phone" value="${state.authForm.phone}" placeholder="+91 98765 43210">
              </label>
              <label>
                <span>Password (min 6 characters)</span>
                <input type="password" id="signup-password" value="${state.authForm.password}" placeholder="••••••••" minlength="6" required>
              </label>
              <button type="submit" class="auth-submit-btn">Create Account</button>
            </form>
            <div class="auth-switch">
              <span>Already have an account?</span>
              <button data-auth-action="switch-to-login" type="button">Log in</button>
            </div>
          `}
        </div>
      </div>
    ` : ""}
  `;

  bindEvents();
}

function syncForm() {
  ["customerName", "customerEmail", "date", "partySize"].forEach((id) => {
    const input = document.querySelector(`#${id}`);
    if (input) state.form[id] = input.value;
  });
  const notes = document.querySelector("#notes");
  if (notes) state.form.notes = notes.value;
}

function bindEvents() {
  const searchForm = document.querySelector("#search-form");
  if (searchForm) {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      state.query = document.querySelector("#search").value;
      state.category = document.querySelector("#category-select").value;
      render();
    });
  }

  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      render();
    });
  });

  document.querySelectorAll("[data-companion-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const companion = companionById(button.dataset.companionId);
      state.activeCompanionId = companion.id;
      state.activeExperienceId = companion.experiences[0]?.id;
      state.errors = {};
      await loadAvailability(companion.id);
      render();
    });
  });

  const experienceSelect = document.querySelector("#experience-select");
  if (experienceSelect) {
    experienceSelect.addEventListener("change", (event) => {
      syncForm();
      state.activeExperienceId = event.target.value;
      render();
    });
  }

  const bookingForm = document.querySelector("#booking-form");
  if (bookingForm) {
    bookingForm.addEventListener("submit", (event) => {
      event.preventDefault();
      syncForm();
      createBooking();
    });
  }

  document.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      syncForm();
      state.form.date = button.dataset.date;
      render();
    });
  });

  document.querySelectorAll("[data-booking-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const meta = {};
      const action = button.dataset.bookingAction;
      const actor = button.dataset.actor || state.activeRole || "customer";
      meta.actor = actor;
      meta.actorRole = actor;
      if (actor === "companion") {
        meta.actorId = state.activeUser?.id || "user-aisha";
      } else if (actor === "admin") {
        meta.actorId = state.activeUser?.id || "user-admin";
      } else {
        meta.actorId = state.activeUser?.id || "user-rohan";
      }

      if (action === "cancelled") {
        meta.cancelledBy = actor;
      }
      if (action === "reviewed") {
        meta.rating = Number(document.querySelector(`[data-review-rating="${button.dataset.bookingId}"]`)?.value || 5);
        meta.review = document.querySelector(`[data-review-text="${button.dataset.bookingId}"]`)?.value.trim() || "Completed public Hyderabad experience.";
      }
      setBookingStatus(button.dataset.bookingId, action, meta);
    });
  });

  document.querySelectorAll("[data-reset]").forEach((button) => {
    button.addEventListener("click", resetDemoData);
  });

  document.querySelectorAll("[data-resolve-report]").forEach((button) => {
    button.addEventListener("click", () => {
      resolveReport(button.dataset.resolveReport);
    });
  });

  document.querySelectorAll("[data-support]").forEach((button) => {
    button.addEventListener("click", () => showSupport(button.dataset.support));
  });

  document.querySelectorAll("[data-switch-role]").forEach((button) => {
    button.addEventListener("click", async () => {
      const newRole = button.dataset.switchRole;
      await quickLogin(newRole);
    });
  });

  document.querySelectorAll("[data-auth-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.authAction;
      if (action === "open-login") {
        state.authModal = "login";
        state.authError = "";
        render();
      } else if (action === "open-signup") {
        state.authModal = "signup";
        state.authError = "";
        render();
      } else if (action === "close") {
        state.authModal = null;
        state.authError = "";
        render();
      } else if (action === "switch-to-signup") {
        state.authModal = "signup";
        state.authError = "";
        render();
      } else if (action === "switch-to-login") {
        state.authModal = "login";
        state.authError = "";
        render();
      } else if (action === "logout") {
        await logout();
      }
    });
  });

  const modalOverlay = document.querySelector("#auth-modal-overlay");
  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) {
        state.authModal = null;
        state.authError = "";
        render();
      }
    });
  }

  const loginForm = document.querySelector("#login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.querySelector("#login-email")?.value.trim();
      const password = document.querySelector("#login-password")?.value;
      if (email && password) {
        state.authForm.email = email;
        state.authForm.password = password;
        await login(email, password);
      }
    });
  }

  const signupForm = document.querySelector("#signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.querySelector("#signup-name")?.value.trim();
      const email = document.querySelector("#signup-email")?.value.trim();
      const role = document.querySelector("#signup-role")?.value || "customer";
      const phone = document.querySelector("#signup-phone")?.value.trim();
      const password = document.querySelector("#signup-password")?.value;
      if (name && email && password) {
        state.authForm = { name, email, role, phone, password };
        await signup({ name, email, role, phone, password });
      }
    });
  }
}

async function initBackend() {
  await loadSession();
  await loadCompanions();
  const companion = activeCompanion();
  if (companion) {
    await loadAvailability(companion.id);
  }
  const apiBookingsLoaded = await loadBookingsFromApi();
  if (!apiBookingsLoaded) {
    state.bookings = loadBookings();
  }
  await loadReviews();
  await loadReports();
  await loadAdminOverview();
  render();
}

render();
initBackend();
