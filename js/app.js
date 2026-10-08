const state = {
  q: "",
  segment: "all",
  major: false,
  overnight: false,
  road: false,
  detour: false,
  selected: null,
  origin: null,
};

let lang = "id";
let notice = null;
let viewingWhole = true;
const endpoints = [];
const phone = window.matchMedia("(max-width: 860px)");
let sheetState = "peek";
let sheetOffset = 0;

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

function checkerFlag() {
  const cells = [];
  const originX = 10;
  const originY = 4.2;
  const size = 4.6;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const dark = (row + col) % 2 === 0;
      cells.push(
        `<rect x="${originX + col * size}" y="${originY + row * size}" width="${size}" height="${size}" fill="${dark ? "#1c1915" : "#f7f4ee"}"/>`
      );
    }
  }
  return `<svg viewBox="0 0 36 40" width="36" height="40" aria-hidden="true" focusable="false">
    <path d="M8 3v34" fill="none" stroke="#fffaf3" stroke-width="4" stroke-linecap="round"/>
    <path d="M8 3v34" fill="none" stroke="#1c1915" stroke-width="2.15" stroke-linecap="round"/>
    ${cells.join("")}
    <rect x="${originX}" y="${originY}" width="${4 * size}" height="${3 * size}" fill="none" stroke="#1c1915" stroke-width="1.15"/>
  </svg>`;
}

function endpointIcon(label) {
  return L.divIcon({
    className: "pin endpoint",
    html: `${checkerFlag()}<span class="pin-label">${escapeHtml(label)}</span>`,
    iconSize: [36, 40],
    iconAnchor: [8, 37],
    popupAnchor: [10, -36],
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

const stationMarkers = [];

function formatKm(km) {
  const digits = km.toFixed(1);
  return `${lang === "id" ? digits.replace(".", ",") : digits} km`;
}

function stationIcon(station) {
  const label = `WS${station.n}`;
  const width = label.length > 3 ? 44 : 36;
  return L.divIcon({
    className: `pin ws${station.finish ? " finish" : ""}`,
    html: `<span>${escapeHtml(label)}</span>`,
    iconSize: [width, 22],
    iconAnchor: [width / 2, 11],
    popupAnchor: [0, -12],
  });
}

function stationPopup(station) {
  const role = station.finish ? t("wsFinish") : t("wsName");
  const place = station.cp ? `${station.name} · ${station.cp}` : station.name;
  const lines = [
    `<strong>WS${station.n} · ${escapeHtml(role)}</strong>`,
    escapeHtml(place),
    escapeHtml(t("wsKm").replace("{km}", formatKm(station.km))),
    escapeHtml(t("wsEle").replace("{ele}", String(station.ele))),
  ];
  if (station.nextKm) {
    const key = station.toFinish ? "wsToFinish" : "wsNext";
    lines.push(escapeHtml(t(key).replace("{km}", formatKm(station.nextKm))));
  }
  return lines.join("<br>");
}

function hereIcon() {
  return L.divIcon({
    className: "pin here",
    html: `<svg viewBox="0 0 36 48" width="36" height="48" aria-hidden="true">
      <path d="M18 46C18 46 4 27 4 16a14 14 0 1 1 28 0c0 11-14 30-14 30z" fill="#1d4ed8" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="18" cy="16" r="5" fill="#fff"/>
    </svg>`,
    iconSize: [36, 48],
    iconAnchor: [18, 46],
    popupAnchor: [0, -44],
  });
}

function paintHere() {
  if (!hereMarker) return;
  hereMarker.setIcon(hereIcon());
  const label = t("youAreHere");
  hereMarker.setPopupContent(`<strong>${escapeHtml(label)}</strong>`);
  hereMarker.setTooltipContent(label);
}

function paintStations() {
  stationMarkers.forEach(({ marker, station }) => {
    marker.setIcon(stationIcon(station));
    marker.setPopupContent(stationPopup(station));
    marker.setTooltipContent(`WS${station.n} · ${station.name}`);
  });
}

(GUIDE.stations || []).forEach((station) => {
  const marker = L.marker([station.lat, station.lng], {
    icon: stationIcon(station),
    zIndexOffset: 450,
  }).addTo(map);
  marker.bindPopup("");
  marker.bindTooltip("", { direction: "top", offset: [0, -8] });
  stationMarkers.push({ marker, station });
});

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

function tags(place, options = {}) {
  const bits = [`<span class="tag">${escapeHtml(kindTag(place))}</span>`];
  if (place.major_er) bits.push(`<span class="tag er">${escapeHtml(t("major"))}</span>`);
  if (!options.skipHours && text(place.hours) && !place.open24) bits.push(`<span class="tag hours-off">${escapeHtml(text(place.hours))}</span>`);
  else if (!options.skipHours && place.open24) bits.push(`<span class="tag">${escapeHtml(t("hours24"))}</span>`);
  if (place.side === "detour") bits.push(`<span class="tag detour">${escapeHtml(t("tagDetour"))}</span>`);
  if (!place.exact && place.kind !== "gap") bits.push(`<span class="tag approx">${escapeHtml(t("tagApprox"))}</span>`);
  if (place.km) bits.push(`<span class="tag">${escapeHtml(place.km)}</span>`);
  return bits.join("");
}

function hoursBrief(place) {
  if (!place.open24) return "";
  return `<div class="tags tags-brief"><span class="tag">${escapeHtml(t("hours24"))}</span></div>`;
}

function moreButton(className) {
  return `<button type="button" class="more ${className}" aria-expanded="false">${escapeHtml(t("showMore"))}</button>`;
}

function directionsLink(place) {
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  return `<a href="${directions}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("directions"))}</a>`;
}

function popupHtml(place) {
  const phone = place.tel
    ? `<a class="phone" href="tel:${escapeHtml(place.tel)}">${escapeHtml(place.phone)}</a>`
    : "";
  return `<div class="popup-card">
    <strong>${escapeHtml(text(place.name))}</strong>
    ${hoursBrief(place)}
    ${phone}
    <div class="actions">${directionsLink(place)}${moreButton("popup-more")}</div>
      <div class="card-extra">
      <div class="tags tags-detail">${tags(place, { skipHours: place.open24 })}</div>
      <p class="meta">${escapeHtml(text(place.address))}</p>
      <p class="note">${escapeHtml(text(place.note))}</p>
    </div>
  </div>`;
}

/* On a phone the zoom buttons and Keterangan sit at the top of the map,
   and Terdekat sits at the bottom. */
function popupOptions() {
  if (!phone.matches) return {};
  return {
    autoPanPaddingTopLeft: L.point(12, 112),
    autoPanPaddingBottomRight: L.point(12, 80),
  };
}

function repositionPopup(popup) {
  const container = popup.getElement();
  if (!container || !popup._map) return;
  container.style.visibility = "hidden";
  popup._updateLayout();
  popup._updatePosition();
  container.style.visibility = "";
  if (popup.options.autoPan) popup._adjustPan();
}

function bindPopupMore(popup) {
  const root = popup.getElement();
  if (!root || root.dataset.moreBound) return;
  root.dataset.moreBound = "1";
  root.addEventListener("click", (event) => {
    const button = event.target.closest(".popup-more");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const card = button.closest(".popup-card");
    const open = card.classList.toggle("is-open");
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.textContent = open ? t("showLess") : t("showMore");
    const marker = popup._source;
    if (hereMarker && marker && marker.getLatLng) keepPopupClearOf(marker, hereMarker.getLatLng());
    else repositionPopup(popup);
  });
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
      marker.bindPopup(popupHtml(place), popupOptions());
      markers.set(place.id, marker);
      return;
    }
    marker.setIcon(iconFor(place));
    marker.setPopupContent(popupHtml(place));
    if (marker.isPopupOpen()) bindPopupMore(marker.getPopup());
  });
}

function renderList(places) {
  const list = document.getElementById("list");
  const count = document.getElementById("count");
  count.textContent = places.length === 1 ? t("countOne") : t("countMany").replace("{n}", String(places.length));
  document.getElementById("sheet-label").textContent = places.length === 1
    ? t("sheetOne")
    : t("sheetMany").replace("{n}", String(places.length));

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
    const selected = place.id === state.selected ? " selected" : "";
    return `<article class="card${place.kind === "gap" ? " gap" : ""}${selected}" data-id="${escapeHtml(place.id)}">
      <div class="card-top"><h2>${escapeHtml(text(place.name))}</h2>${distanceLabel(place)}</div>
      <div class="tags tags-full">${tags(place)}</div>
      ${hoursBrief(place)}
      ${phone}
      <div class="actions">${directionsLink(place)}${moreButton("")}</div>
      <div class="card-extra">
        <div class="tags tags-detail">${tags(place, { skipHours: place.open24 })}</div>
        <p class="meta">${escapeHtml(text(place.address))}</p>
        <p class="note">${escapeHtml(text(place.note))}</p>
      </div>
    </article>`;
  }).join("");

  list.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", (event) => {
      const more = event.target.closest(".more");
      if (more) {
        event.preventDefault();
        event.stopPropagation();
        const open = card.classList.toggle("is-open");
        more.setAttribute("aria-expanded", open ? "true" : "false");
        more.textContent = open ? t("showLess") : t("showMore");
        return;
      }
      if (event.target.closest("a")) return;
      if (phone.matches) {
        if (document.activeElement && document.activeElement.id === "search") document.activeElement.blur();
        setSheet("peek");
      }
      select(card.dataset.id, true);
    });
  });
}

function distanceLabel(place) {
  if (!state.origin) return "";
  const meters = state.origin.distanceTo([place.lat, place.lng]);
  return `<span class="away">${escapeHtml(formatDistance(meters))}</span>`;
}

function listedPlaces() {
  const places = GUIDE.places.filter(visible);
  if (!state.origin) return places;
  return places
    .map((place, index) => ({ place, index }))
    .sort((a, b) => {
      const delta = state.origin.distanceTo([a.place.lat, a.place.lng]) - state.origin.distanceTo([b.place.lat, b.place.lng]);
      return delta || a.index - b.index;
    })
    .map((item) => item.place);
}

/* On a phone the list is a sheet that is usually lowered, and scrolling it
   would also scroll the page under the map. */
function revealCard(card) {
  if (!card || phone.matches) return;
  card.scrollIntoView({ block: "nearest" });
}

function render() {
  const places = listedPlaces();
  const segment = GUIDE.segments.find((item) => item.id === state.segment);
  document.getElementById("blurb").textContent = state.origin
    ? t("blurbNearest")
    : (segment ? text(segment.blurb) : t("blurbAll"));
  renderList(places);
  syncMarkers(places);
  revealCard(document.querySelector(".card.selected"));
}

function select(id, fly, afterOpen) {
  state.selected = id;
  const place = GUIDE.places.find((item) => item.id === id);
  if (!place) return;
  document.querySelectorAll(".card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.id === id);
  });
  const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  revealCard(card);
  const marker = markers.get(id);
  if (!marker) return;
  const zoom = place.exact && place.kind !== "gap" ? 16 : 14;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const open = () => {
    let panning = false;
    const onPan = () => { panning = true; };
    map.once("autopanstart", onPan);
    marker.openPopup();
    map.off("autopanstart", onPan);
    if (!afterOpen) return;
    if (panning) map.once("moveend", () => afterOpen(marker));
    else afterOpen(marker);
  };
  if (fly) {
    const target = L.latLng(place.lat, place.lng);
    const alreadyThere = map.getCenter().distanceTo(target) < 40 && Math.abs(map.getZoom() - zoom) < 0.5;
    if (alreadyThere || reduce) {
      map.setView(target, zoom);
      open();
    } else {
      map.flyTo(target, zoom, { duration: 0.55 });
      map.once("moveend", open);
    }
  } else {
    open();
  }
}

const POPUP_OFFSET = L.point(0, 7);

function resetPopupShift(popup) {
  popup.options.offset = POPUP_OFFSET;
  const tip = popup.getElement() && popup.getElement().querySelector(".leaflet-popup-tip-container");
  if (tip) {
    tip.style.marginLeft = "";
    tip.style.visibility = "";
  }
}

/* Slide the popup sideways so it does not cover the "you are here" pin.
   The tip is moved back so it still points at the hospital. */
function keepPopupClearOf(marker, here) {
  const popup = marker.getPopup();
  if (!popup || !popup.isOpen()) return;
  popup.options.autoPan = false;
  popup.options.offset = POPUP_OFFSET;
  repositionPopup(popup);
  resetPopupShift(popup);
  const el = popup.getElement();
  const box = el.getBoundingClientRect();
  const origin = map.getContainer().getBoundingClientRect();
  const you = map.latLngToContainerPoint(here);
  const gap = 10;
  const pin = {
    left: origin.left + you.x - 18 - gap,
    right: origin.left + you.x + 18 + gap,
    top: origin.top + you.y - 46 - gap,
    bottom: origin.top + you.y + 2 + gap,
  };
  const overlaps = box.left < pin.right && box.right > pin.left && box.top < pin.bottom && box.bottom > pin.top;
  if (!overlaps) return;

  const hospitalX = map.latLngToContainerPoint(marker.getLatLng()).x;
  const dx = you.x >= hospitalX ? pin.left - box.right : pin.right - box.left;
  popup.options.offset = L.point(dx, POPUP_OFFSET.y);
  popup.options.autoPan = false;
  repositionPopup(popup);
  popup.options.autoPan = true;

  const tip = el.querySelector(".leaflet-popup-tip-container");
  if (tip) {
    const room = box.width / 2 - 24;
    if (Math.abs(dx) <= room) tip.style.marginLeft = `${-20 - dx}px`;
    else tip.style.visibility = "hidden";
  }

  nudgePopupIntoView(el, here);
  marker.once("popupclose", () => resetPopupShift(popup));
}

const MAP_OVERLAYS = [".leaflet-control-zoom", ".map-tools", "#nearest", "#route-fit", "#legend-toggle", ".legend", "#map-note"];

function safeMapRect() {
  const mapBox = map.getContainer().getBoundingClientRect();
  const middle = (mapBox.top + mapBox.bottom) / 2;
  const left = mapBox.left + 8;
  const right = mapBox.right - 8;
  let top = mapBox.top + 8;
  let bottom = mapBox.bottom - 8;
  MAP_OVERLAYS.forEach((selector) => {
    const node = document.querySelector(selector);
    if (!node || node.hidden) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return;
    if ((rect.top + rect.bottom) / 2 < middle) top = Math.max(top, rect.bottom + 6);
    else bottom = Math.min(bottom, rect.top - 6);
  });
  return { left, right, top, bottom };
}

/* Pan so the location pin and the shifted popup stay inside the phone map,
   clear of the zoom buttons, the tool row, and the legend. */
function nudgePopupIntoView(popupEl, here) {
  const safe = safeMapRect();
  const pop = popupEl.getBoundingClientRect();
  const you = map.latLngToContainerPoint(here);
  const origin = map.getContainer().getBoundingClientRect();
  const pinRight = origin.left + you.x + 18;
  const pinBottom = origin.top + you.y + 2;
  let x = 0;
  let y = 0;
  if (pinRight > safe.right) x += pinRight - safe.right;
  if (pop.top < safe.top) y += pop.top - safe.top;
  if (pinBottom > safe.bottom) y += pinBottom - safe.bottom;
  if (pop.left < safe.left) {
    const push = safe.left - pop.left;
    const room = safe.right - pinRight;
    if (push <= room) x -= push;
  }
  if (x || y) map.panBy([x, y], { animate: false });
}

/* How much of the map the sheet covers at its target stop.
   The sheet slides, so measuring it mid-slide zooms the whole route out. */
function sheetCover() {
  const stops = sheetStops();
  return Math.max(0, Math.round(stops[sheetState] - stops.peek));
}

function mapPadding() {
  if (!phone.matches) {
    const dock = document.querySelector(".map-dock");
    const bottom = Math.max(52, (dock ? dock.offsetHeight : 0) + 16);
    return {
      paddingTopLeft: [16, 16],
      paddingBottomRight: [16, bottom],
    };
  }
  const size = map.getSize();
  const covered = sheetCover();
  let extra = covered < 72 ? 72 : 12;
  const note = document.getElementById("map-note");
  if (note && !note.hidden) {
    const noteRect = note.getBoundingClientRect();
    const sheetTop = sheet.getBoundingClientRect().top;
    if (noteRect.height > 1 && noteRect.top < sheetTop - 4) extra += Math.round(noteRect.height) + 8;
  }
  let bottom = covered + extra;
  const top = 48;
  if (size.y > 0 && top + bottom > size.y - 120) bottom = Math.max(0, size.y - top - 120);
  return {
    paddingTopLeft: [12, top],
    paddingBottomRight: [12, bottom],
  };
}

function routeIndex(place) {
  const line = corridor.getLatLngs();
  const here = L.latLng(place.lat, place.lng);
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < line.length; i += 1) {
    const distance = here.distanceTo(line[i]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/* Frame the orange line for this section, plus any pin that sits off the line. */
function frameBounds(places) {
  const whole = state.segment === "all" && !state.major && !state.overnight && !state.road && !state.detour && !state.q;
  if (whole || !places.length) return corridor.getBounds();
  const line = corridor.getLatLngs();
  let start = routeIndex(places[0]);
  let end = routeIndex(places[places.length - 1]);
  if (end < start) {
    const swap = start;
    start = end;
    end = swap;
  }
  start = Math.max(0, start - 3);
  end = Math.min(line.length - 1, end + 3);
  const bounds = L.latLngBounds(line.slice(start, end + 1));
  places.forEach((place) => bounds.extend([place.lat, place.lng]));
  return bounds;
}

function paddingParts(padding) {
  const tl = L.point(padding.paddingTopLeft || [0, 0]);
  const br = L.point(padding.paddingBottomRight || [0, 0]);
  return { total: tl.add(br), offset: br.subtract(tl).divideBy(2) };
}

function fittedZoom(bounds, padding) {
  return map.getBoundsZoom(bounds, false, paddingParts(padding).total);
}

function frameCenter(bounds, zoom, padding) {
  const sw = map.project(bounds.getSouthWest(), zoom);
  const ne = map.project(bounds.getNorthEast(), zoom);
  return map.unproject(sw.add(ne).divideBy(2).add(paddingParts(padding).offset), zoom);
}

function fitTo(places, animate) {
  const whole = wholeSegment();
  viewingWhole = whole;
  if (phone.matches) {
    const visible = sheet.getBoundingClientRect().top - map.getContainer().getBoundingClientRect().top;
    if (whole || visible < 240) setSheet("peek");
  }
  const bounds = frameBounds(places);
  const padding = mapPadding();
  let zoom = fittedZoom(bounds, padding);
  if (phone.matches && whole) zoom = Math.max(zoom, 9);
  if (phone.matches && state.segment === "cimahi") zoom = Math.max(map.getMinZoom(), zoom - 1);
  const center = frameCenter(bounds, zoom, padding);
  const reduce = animate === false || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) map.setView(center, zoom);
  else map.flyTo(center, zoom, { duration: 0.45 });
  syncRouteReturn();
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
  paintStations();
  paintHere();
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
  const text = document.getElementById("map-note-text");
  const nearest = notice && notice.key === "nearestIs";
  if (!notice) {
    el.hidden = true;
    el.classList.remove("is-nearest", "show-return");
    text.textContent = "";
    mapWrap.classList.remove("has-nearest", "show-return");
    return;
  }
  el.hidden = false;
  el.classList.toggle("is-nearest", nearest);
  mapWrap.classList.toggle("has-nearest", nearest && phone.matches);
  text.textContent = nearest
    ? t("nearestIs").replace("{name}", notice.name).replace("{distance}", formatDistance(notice.meters))
    : t(notice.key);
  syncRouteReturn();
}

/* The return button is only useful once the map has left the whole-route view. */
function syncRouteReturn() {
  const nearest = notice && notice.key === "nearestIs" && phone.matches;
  const zoom = typeof map.getZoom === "function" ? map.getZoom() : undefined;
  const framed = wholeSegment() && (viewingWhole || (zoom !== undefined && zoom <= 9.05));
  const show = Boolean(nearest && !framed);
  document.getElementById("map-note").classList.toggle("show-return", show);
  mapWrap.classList.toggle("show-return", show);
}

function wholeSegment() {
  return state.segment === "all" && !state.major && !state.overnight && !state.road && !state.detour && !state.q;
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
  map.closePopup();
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

const shell = document.querySelector(".shell");
const sheet = document.getElementById("panel");
const handle = document.getElementById("sheet-handle");
const searchInput = document.getElementById("search");
const mapWrap = document.getElementById("map-wrap");
const legendToggle = document.getElementById("legend-toggle");
const SHEET_ORDER = ["peek", "half", "full"];

function sheetStops() {
  const bottomInset = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
  const peek = Math.round(searchInput.offsetTop + searchInput.offsetHeight + 12 + bottomInset);
  const full = sheet.offsetHeight;
  const half = Math.max(peek + 80, Math.min(full, Math.round(shell.clientHeight * 0.55)));
  return { peek, half, full };
}

function placeSheet(offset) {
  sheetOffset = offset;
  sheet.style.transform = `translateY(${offset}px)`;
}

function setSheet(state) {
  if (!phone.matches) return;
  sheetState = state;
  placeSheet(sheet.offsetHeight - sheetStops()[state]);
  sheet.dataset.state = state;
  handle.setAttribute("aria-expanded", state === "peek" ? "false" : "true");
}

function layoutSheet() {
  if (!phone.matches) {
    sheet.style.transform = "";
    shell.style.removeProperty("--peek");
    map.invalidateSize();
    return;
  }
  shell.style.setProperty("--peek", `${sheetStops().peek}px`);
  setSheet(sheetState);
  map.invalidateSize();
}

function setLegend(open) {
  mapWrap.classList.toggle("legend-open", open);
  legendToggle.setAttribute("aria-expanded", open ? "true" : "false");
}

function showWholeRoute() {
  map.closePopup();
  setLegend(false);
  setSheet("peek");
  state.segment = "all";
  document.querySelectorAll(".seg").forEach((item) => {
    item.setAttribute("aria-pressed", item.dataset.segment === "all" ? "true" : "false");
  });
  render();
  fitTo(GUIDE.places.filter(visible));
}

let drag = null;
let dragged = false;
let dragEndedAt = 0;

handle.addEventListener("pointerdown", (event) => {
  if (!phone.matches) return;
  dragged = false;
  drag = { y: event.clientY, offset: sheetOffset, lastY: event.clientY, lastT: event.timeStamp, v: 0 };
  handle.setPointerCapture(event.pointerId);
});

handle.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const dy = event.clientY - drag.y;
  if (!dragged && Math.abs(dy) < 6) return;
  if (!dragged) {
    dragged = true;
    sheet.classList.add("dragging");
  }
  const dt = event.timeStamp - drag.lastT;
  if (dt > 0) drag.v = (event.clientY - drag.lastY) / dt;
  drag.lastY = event.clientY;
  drag.lastT = event.timeStamp;
  const lowest = sheet.offsetHeight - sheetStops().peek;
  placeSheet(Math.min(lowest, Math.max(0, drag.offset + dy)));
});

function endDrag() {
  if (!drag) return;
  const velocity = drag.v;
  drag = null;
  if (!dragged) return;
  dragged = false;
  dragEndedAt = performance.now();
  sheet.classList.remove("dragging");
  const stops = sheetStops();
  const shown = sheet.offsetHeight - sheetOffset;
  let next = SHEET_ORDER.reduce((best, state) =>
    Math.abs(stops[state] - shown) < Math.abs(stops[best] - shown) ? state : best, "peek");
  if (velocity < -0.45) next = SHEET_ORDER.find((state) => stops[state] > shown + 4) || "full";
  if (velocity > 0.45) next = [...SHEET_ORDER].reverse().find((state) => stops[state] < shown - 4) || "peek";
  setSheet(next);
}

handle.addEventListener("pointerup", endDrag);
handle.addEventListener("pointercancel", endDrag);
handle.addEventListener("click", () => {
  if (performance.now() - dragEndedAt < 400) return;
  setSheet(sheetState === "peek" ? "half" : "peek");
});

searchInput.addEventListener("focus", () => setSheet("full"));

legendToggle.addEventListener("click", () => {
  setLegend(!mapWrap.classList.contains("legend-open"));
});

map.on("click dragstart", () => {
  if (!phone.matches) return;
  setLegend(false);
  if (sheetState !== "peek") setSheet("peek");
});

window.addEventListener("resize", layoutSheet);
phone.addEventListener("change", layoutSheet);

document.getElementById("route-fit").addEventListener("click", showWholeRoute);

document.getElementById("nearest").addEventListener("click", () => {
  setLegend(false);
  setSheet("peek");
  if (!navigator.geolocation) {
    showNotice({ key: "noGeo" });
    return;
  }
  showNotice({ key: "finding" });
  navigator.geolocation.getCurrentPosition((position) => {
    const here = L.latLng(position.coords.latitude, position.coords.longitude);
    state.origin = here;
    if (hereMarker) map.removeLayer(hereMarker);
    hereMarker = L.marker(here, { icon: hereIcon(), zIndexOffset: 800 }).addTo(map);
    hereMarker.bindPopup("");
    hereMarker.bindTooltip("", { direction: "top", offset: [0, -36] });
    paintHere();
    const nearest = GUIDE.places
      .filter((place) => place.kind !== "gap")
      .map((place) => ({ place, meters: here.distanceTo([place.lat, place.lng]) }))
      .sort((a, b) => a.meters - b.meters)[0];
    if (!nearest) return;
    viewingWhole = false;
    showNotice({
      key: "nearestIs",
      name: text(nearest.place.name),
      meters: nearest.meters,
    });
    state.segment = "all";
    document.querySelectorAll(".seg").forEach((item) => {
      item.setAttribute("aria-pressed", item.dataset.segment === "all" ? "true" : "false");
    });
    render();
    const dodge = (marker) => keepPopupClearOf(marker, here);
    const closeEnough = nearest.meters < 250;
    if (closeEnough) {
      select(nearest.place.id, true, dodge);
    } else {
      const bounds = L.latLngBounds([here, [nearest.place.lat, nearest.place.lng]]);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const options = { ...mapPadding(), maxZoom: 15 };
      map.once("moveend", () => select(nearest.place.id, false, dodge));
      if (reduce) map.fitBounds(bounds, options);
      else map.flyToBounds(bounds, { ...options, duration: 0.6 });
    }
  }, () => {
    showNotice({ key: "geoDenied" });
  }, { enableHighAccuracy: true, timeout: 8000 });
});

document.querySelectorAll("[data-lang]").forEach((button) => {
  button.addEventListener("click", () => setLang(button.dataset.lang));
});

setLang(initialLang());
layoutSheet();
map.on("popupopen", (event) => bindPopupMore(event.popup));
map.on("moveend", syncRouteReturn);
fitTo(GUIDE.places.filter(visible), false);
