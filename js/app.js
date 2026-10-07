const state = {
  q: "",
  segment: "all",
  major: false,
  overnight: false,
  road: false,
  detour: false,
  selected: null,
};

let lang = "id";
let notice = null;
const endpoints = [];

const map = L.map("map", { scrollWheelZoom: true });
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

L.polyline(GUIDE.route, { color: "#fffaf3", weight: 9, opacity: 0.95, lineJoin: "round" }).addTo(map);
const corridor = L.polyline(GUIDE.route, { color: "#c65314", weight: 4, opacity: 0.95, lineJoin: "round" }).addTo(map);

const markers = new Map();
let hereMarker = null;

function t(key) {
  const row = I18N[key];
  return (row && (row[lang] || row.en)) || "";
}

function text(value) {
  if (value && typeof value === "object") return value[lang] || value.en || "";
  return value || "";
}

function both(value) {
  if (value && typeof value === "object") return `${value.id || ""} ${value.en || ""}`;
  return value || "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function iconFor(place) {
  const classes = ["pin", place.kind];
  if (place.major_er) classes.push("er");
  if (!place.exact && place.kind !== "gap") classes.push("approx");
  const size = place.major_er ? 32 : place.kind === "gap" ? 28 : 16;
  const mark = place.major_er ? `<span>${escapeHtml(t("pinEr"))}</span>` : place.kind === "gap" ? "<span></span>" : "";
  return L.divIcon({
    className: classes.join(" "),
    html: mark,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function endpointIcon(letter) {
  return L.divIcon({
    className: "pin endpoint",
    html: `<span>${escapeHtml(letter)}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

function paintEndpoint(item) {
  item.marker.setIcon(endpointIcon(t(item.letterKey)));
  const point = item.point;
  item.marker.setPopupContent(
    `<strong>${escapeHtml(text(point.name))}</strong><br>${escapeHtml(text(point.detail))}<br>${escapeHtml(text(point.note))}`
  );
}

function addEndpoint(point, letterKey) {
  const marker = L.marker([point.lat, point.lng], { icon: endpointIcon(t(letterKey)), zIndexOffset: 400 }).addTo(map);
  const item = { marker, point, letterKey };
  endpoints.push(item);
  marker.bindPopup("");
  paintEndpoint(item);
}

addEndpoint(GUIDE.start, "letterStart");
addEndpoint(GUIDE.finish, "letterFinish");

function visible(place) {
  if (state.segment !== "all" && place.segment !== state.segment) return false;
  if (place.kind === "gap") {
    if (state.major || state.overnight || state.detour) return false;
  } else {
    if (state.major && !place.major_er) return false;
    if (state.overnight && !place.open24) return false;
    if (state.road && place.side !== "road") return false;
    if (state.detour && place.side !== "detour") return false;
  }
  if (state.road && place.kind !== "gap" && place.side !== "road") return false;
  if (state.q) {
    const hay = [both(place.name), both(place.address), place.phone, both(place.note), both(place.hours), place.km]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}

function kindTag(place) {
  if (place.kind === "gap") return t("kindGap");
  if (place.kind === "rsia") return t("kindRsia");
  if (place.kind === "clinic") return t("kindClinic");
  if (place.kind === "puskesmas") return t("kindPuskesmas");
  return t("kindHospital");
}

function tags(place) {
  const bits = [`<span class="tag">${escapeHtml(kindTag(place))}</span>`];
  if (place.major_er) bits.push(`<span class="tag er">${escapeHtml(t("major"))}</span>`);
  if (text(place.hours) && !place.open24) bits.push(`<span class="tag hours-off">${escapeHtml(text(place.hours))}</span>`);
  else if (place.open24) bits.push(`<span class="tag">${escapeHtml(t("hours24"))}</span>`);
  if (place.side === "detour") bits.push(`<span class="tag detour">${escapeHtml(t("tagDetour"))}</span>`);
  if (!place.exact && place.kind !== "gap") bits.push(`<span class="tag approx">${escapeHtml(t("tagApprox"))}</span>`);
  if (place.km) bits.push(`<span class="tag">${escapeHtml(place.km)}</span>`);
  return bits.join("");
}

function popupHtml(place) {
  const phone = place.tel
    ? `<br><a href="tel:${escapeHtml(place.tel)}">${escapeHtml(place.phone)}</a>`
    : "";
  const hours = text(place.hours) ? `<br>${escapeHtml(text(place.hours))}` : "";
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  return `<strong>${escapeHtml(text(place.name))}</strong><br>${escapeHtml(text(place.address))}${hours}${phone}<br>${escapeHtml(text(place.note))}<br><a href="${directions}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("directions"))}</a>`;
}

function syncMarkers(places) {
  const ids = new Set(places.map((place) => place.id));
  markers.forEach((marker, id) => {
    if (!ids.has(id)) {
      map.removeLayer(marker);
      markers.delete(id);
    }
  });
  places.forEach((place) => {
    let marker = markers.get(place.id);
    if (!marker) {
      marker = L.marker([place.lat, place.lng], {
        icon: iconFor(place),
        zIndexOffset: place.major_er ? 300 : place.kind === "gap" ? 200 : 0,
      }).addTo(map);
      marker.on("click", () => select(place.id, false));
      marker.bindPopup(popupHtml(place));
      markers.set(place.id, marker);
      return;
    }
    marker.setIcon(iconFor(place));
    marker.setPopupContent(popupHtml(place));
  });
}

function renderList(places) {
  const list = document.getElementById("list");
  const count = document.getElementById("count");
  count.textContent = places.length === 1 ? t("countOne") : t("countMany").replace("{n}", String(places.length));

  if (!places.length) {
    list.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = t("empty");
    list.append(empty);
    return;
  }

  list.innerHTML = places.map((place) => {
    const phone = place.tel
      ? `<a class="phone" href="tel:${escapeHtml(place.tel)}">${escapeHtml(place.phone)}</a>`
      : "";
    const directions = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
    const selected = place.id === state.selected ? " selected" : "";
    return `<article class="card${place.kind === "gap" ? " gap" : ""}${selected}" data-id="${escapeHtml(place.id)}">
      <div class="card-top"><h2>${escapeHtml(text(place.name))}</h2></div>
      <div class="tags">${tags(place)}</div>
      <p class="meta">${escapeHtml(text(place.address))}</p>
      ${phone}
      <p class="note">${escapeHtml(text(place.note))}</p>
      <div class="actions"><a href="${directions}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("directions"))}</a></div>
    </article>`;
  }).join("");

  list.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      select(card.dataset.id, true);
    });
  });
}

function render() {
  const places = GUIDE.places.filter(visible);
  const segment = GUIDE.segments.find((item) => item.id === state.segment);
  document.getElementById("blurb").textContent = segment ? text(segment.blurb) : t("blurbAll");
  renderList(places);
  syncMarkers(places);
  const selectedCard = document.querySelector(".card.selected");
  if (selectedCard) selectedCard.scrollIntoView({ block: "nearest" });
}

function select(id, fly) {
  state.selected = id;
  const place = GUIDE.places.find((item) => item.id === id);
  if (!place) return;
  document.querySelectorAll(".card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.id === id);
  });
  const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (card) card.scrollIntoView({ block: "nearest" });
  const marker = markers.get(id);
  if (!marker) return;
  const zoom = place.exact && place.kind !== "gap" ? 16 : 14;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (fly) {
    const target = L.latLng(place.lat, place.lng);
    const alreadyThere = map.getCenter().distanceTo(target) < 40 && Math.abs(map.getZoom() - zoom) < 0.5;
    if (alreadyThere || reduce) {
      map.setView(target, zoom);
      marker.openPopup();
    } else {
      map.flyTo(target, zoom, { duration: 0.55 });
      map.once("moveend", () => marker.openPopup());
    }
  } else {
    marker.openPopup();
  }
}

function mapPadding() {
  const narrow = window.innerWidth < 861;
  return {
    paddingTopLeft: [16, 16],
    paddingBottomRight: narrow ? [16, 92] : [16, 52],
  };
}

function fitTo(places) {
  const points = places.map((place) => [place.lat, place.lng]);
  const padding = mapPadding();
  if (!points.length) {
    map.fitBounds(corridor.getBounds(), padding);
    return;
  }
  map.fitBounds(L.latLngBounds(points).pad(0.2), { ...padding, maxZoom: 13 });
}

function paintSegments() {
  const holder = document.getElementById("segments");
  const buttons = [{ id: "all", label: t("wholeRoute") }, ...GUIDE.segments.map((segment) => ({
    id: segment.id,
    label: text(segment.label),
  }))];
  holder.innerHTML = buttons.map((button) =>
    `<button type="button" class="seg" data-segment="${button.id}" aria-pressed="${button.id === state.segment ? "true" : "false"}">${escapeHtml(button.label)}</button>`
  ).join("");
}

function applyCopy() {
  document.documentElement.lang = lang;
  document.title = t("title");
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", t("description"));
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
    el.alt = t(el.dataset.i18nAlt);
  });
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.lang === lang ? "true" : "false");
  });
  document.getElementById("expand").textContent = document.body.classList.contains("map-full") ? t("showList") : t("fullMap");
  paintSegments();
  endpoints.forEach(paintEndpoint);
  render();
  paintNotice();
}

function setLang(next) {
  lang = next === "en" ? "en" : "id";
  try {
    localStorage.setItem("playon-lang", lang);
  } catch (err) {
    /* Language still switches for this visit if storage is blocked. */
  }
  const url = new URL(location.href);
  if (url.searchParams.has("lang")) {
    url.searchParams.set("lang", lang);
    history.replaceState(null, "", url);
  }
  applyCopy();
}

function initialLang() {
  const query = new URLSearchParams(location.search).get("lang");
  if (query === "id" || query === "en") return query;
  try {
    const saved = localStorage.getItem("playon-lang");
    if (saved === "id" || saved === "en") return saved;
  } catch (err) {
    /* Fall through to Indonesian. */
  }
  return "id";
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const digits = (meters / 1000).toFixed(1);
  return `${lang === "id" ? digits.replace(".", ",") : digits} km`;
}

function paintNotice() {
  const el = document.getElementById("map-note");
  if (!notice) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  if (notice.key === "nearestIs") {
    el.textContent = t("nearestIs")
      .replace("{name}", notice.name)
      .replace("{distance}", formatDistance(notice.meters));
    return;
  }
  el.textContent = t(notice.key);
}

function showNotice(next) {
  notice = next;
  paintNotice();
}

document.getElementById("segments").addEventListener("click", (event) => {
  const button = event.target.closest(".seg");
  if (!button) return;
  state.segment = button.dataset.segment;
  document.querySelectorAll(".seg").forEach((item) => {
    item.setAttribute("aria-pressed", item === button ? "true" : "false");
  });
  render();
  fitTo(GUIDE.places.filter(visible));
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const key = chip.dataset.filter;
    if (key === "road" && !state.road) state.detour = false;
    if (key === "detour" && !state.detour) state.road = false;
    state[key] = !state[key];
    document.querySelectorAll(".chip").forEach((item) => {
      item.setAttribute("aria-pressed", state[item.dataset.filter] ? "true" : "false");
    });
    render();
    fitTo(GUIDE.places.filter(visible));
  });
});

document.getElementById("search").addEventListener("input", (event) => {
  state.q = event.target.value.trim().toLowerCase();
  render();
});

document.getElementById("expand").addEventListener("click", () => {
  const full = document.body.classList.toggle("map-full");
  document.getElementById("expand").textContent = full ? t("showList") : t("fullMap");
  setTimeout(() => map.invalidateSize(), 60);
});

document.getElementById("nearest").addEventListener("click", () => {
  if (!navigator.geolocation) {
    showNotice({ key: "noGeo" });
    return;
  }
  showNotice({ key: "finding" });
  navigator.geolocation.getCurrentPosition((position) => {
    const here = L.latLng(position.coords.latitude, position.coords.longitude);
    if (hereMarker) map.removeLayer(hereMarker);
    hereMarker = L.circleMarker(here, {
      radius: 7,
      color: "#1c1915",
      weight: 2,
      fillColor: "#e7b089",
      fillOpacity: 1,
    }).addTo(map);
    const nearest = GUIDE.places
      .filter((place) => place.kind !== "gap")
      .map((place) => ({ place, meters: here.distanceTo([place.lat, place.lng]) }))
      .sort((a, b) => a.meters - b.meters)[0];
    if (!nearest) return;
    showNotice({
      key: "nearestIs",
      name: text(nearest.place.name),
      meters: nearest.meters,
    });
    select(nearest.place.id, true);
  }, () => {
    showNotice({ key: "geoDenied" });
  }, { enableHighAccuracy: true, timeout: 8000 });
});

document.querySelectorAll("[data-lang]").forEach((button) => {
  button.addEventListener("click", () => setLang(button.dataset.lang));
});

setLang(initialLang());
map.fitBounds(corridor.getBounds(), mapPadding());
