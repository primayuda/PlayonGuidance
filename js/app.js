const state = {
  q: "",
  segment: "all",
  major: false,
  overnight: false,
  road: false,
  detour: false,
  selected: null,
};

const map = L.map("map", { scrollWheelZoom: true });
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

L.polyline(GUIDE.route, { color: "#fffaf3", weight: 9, opacity: 0.95, lineJoin: "round" }).addTo(map);
const corridor = L.polyline(GUIDE.route, { color: "#c65314", weight: 4, opacity: 0.95, lineJoin: "round" }).addTo(map);

const markers = new Map();
let hereMarker = null;

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
  const big = place.major_er || place.kind === "gap";
  const size = big ? 28 : 16;
  return L.divIcon({
    className: classes.join(" "),
    html: place.major_er ? "<span>ER</span>" : place.kind === "gap" ? "<span></span>" : "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function endpointIcon(letter) {
  return L.divIcon({
    className: "pin endpoint",
    html: `<span>${letter}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

function addEndpoint(point, letter) {
  L.marker([point.lat, point.lng], { icon: endpointIcon(letter), zIndexOffset: 400 })
    .addTo(map)
    .bindPopup(`<strong>${escapeHtml(point.name)}</strong><br>${escapeHtml(point.detail)}<br>${escapeHtml(point.note)}`);
}

addEndpoint(GUIDE.start, "S");
addEndpoint(GUIDE.finish, "F");

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
    const hay = [place.name, place.address, place.phone, place.note, place.km].join(" ").toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}

function kindTag(place) {
  if (place.kind === "gap") return "Gap";
  if (place.kind === "rsia") return "Mother & child";
  if (place.kind === "clinic") return "Clinic";
  if (place.kind === "puskesmas") return "Puskesmas";
  return "Hospital";
}

function tags(place) {
  const bits = [`<span class="tag">${kindTag(place)}</span>`];
  if (place.major_er) bits.push('<span class="tag er">Major ER</span>');
  if (place.hours && !place.open24) bits.push(`<span class="tag hours-off">${escapeHtml(place.hours)}</span>`);
  else if (place.open24) bits.push('<span class="tag">24 hours</span>');
  if (place.side === "detour") bits.push('<span class="tag detour">Detour</span>');
  if (!place.exact && place.kind !== "gap") bits.push('<span class="tag approx">Approximate pin</span>');
  if (place.km) bits.push(`<span class="tag">${escapeHtml(place.km)}</span>`);
  return bits.join("");
}

function popupHtml(place) {
  const phone = place.tel
    ? `<br><a href="tel:${escapeHtml(place.tel)}">${escapeHtml(place.phone)}</a>`
    : "";
  const hours = place.hours ? `<br>${escapeHtml(place.hours)}` : "";
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  return `<strong>${escapeHtml(place.name)}</strong><br>${escapeHtml(place.address)}${hours}${phone}<br>${escapeHtml(place.note)}<br><a href="${directions}" target="_blank" rel="noopener noreferrer">Directions</a>`;
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
    if (markers.has(place.id)) return;
    const marker = L.marker([place.lat, place.lng], {
      icon: iconFor(place),
      zIndexOffset: place.major_er ? 300 : place.kind === "gap" ? 200 : 0,
    })
      .addTo(map)
      .bindPopup(popupHtml(place));
    marker.on("click", () => select(place.id, false));
    markers.set(place.id, marker);
  });
}

function renderList(places) {
  const list = document.getElementById("list");
  const count = document.getElementById("count");
  count.textContent = places.length === 1 ? "1 on the map" : `${places.length} on the map`;

  if (!places.length) {
    list.innerHTML = '<p class="empty">Nothing matches. Clear a filter or try another name.</p>';
    return;
  }

  list.innerHTML = places.map((place) => {
    const phone = place.tel
      ? `<a class="phone" href="tel:${escapeHtml(place.tel)}">${escapeHtml(place.phone)}</a>`
      : "";
    const directions = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
    const selected = place.id === state.selected ? " selected" : "";
    return `<article class="card${place.kind === "gap" ? " gap" : ""}${selected}" data-id="${escapeHtml(place.id)}">
      <div class="card-top"><h2>${escapeHtml(place.name)}</h2></div>
      <div class="tags">${tags(place)}</div>
      <p class="meta">${escapeHtml(place.address)}</p>
      ${phone}
      <p class="note">${escapeHtml(place.note)}</p>
      <div class="actions"><a href="${directions}" target="_blank" rel="noopener noreferrer">Directions</a></div>
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
  document.getElementById("blurb").textContent = segment
    ? segment.blurb
    : "In road order from Jakarta to Bandung. Red markers are the larger emergency rooms named in the crew notes.";
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

function buildSegments() {
  const holder = document.getElementById("segments");
  const buttons = [{ id: "all", label: "Whole route" }, ...GUIDE.segments.map((segment) => ({
    id: segment.id,
    label: segment.label,
  }))];
  holder.innerHTML = buttons.map((button) =>
    `<button type="button" class="seg" data-segment="${button.id}" aria-pressed="${button.id === "all" ? "true" : "false"}">${escapeHtml(button.label)}</button>`
  ).join("");
  holder.addEventListener("click", (event) => {
    const button = event.target.closest(".seg");
    if (!button) return;
    state.segment = button.dataset.segment;
    holder.querySelectorAll(".seg").forEach((item) => {
      item.setAttribute("aria-pressed", item === button ? "true" : "false");
    });
    render();
    fitTo(GUIDE.places.filter(visible));
  });
}

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
  document.getElementById("expand").textContent = full ? "Show list" : "Full map";
  setTimeout(() => map.invalidateSize(), 60);
});

document.getElementById("nearest").addEventListener("click", () => {
  const note = document.getElementById("map-note");
  if (!navigator.geolocation) {
    note.hidden = false;
    note.textContent = "This browser cannot share your location.";
    return;
  }
  note.hidden = false;
  note.textContent = "Finding your position…";
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
    const km = nearest.meters / 1000;
    const distance = km < 1 ? `${Math.round(nearest.meters)} m` : `${km.toFixed(1)} km`;
    note.textContent = `Nearest is ${nearest.place.name}, about ${distance} away.`;
    select(nearest.place.id, true);
  }, () => {
    note.hidden = false;
    note.textContent = "Location was not available. You can still search the list.";
  }, { enableHighAccuracy: true, timeout: 8000 });
});

buildSegments();
render();
map.fitBounds(corridor.getBounds(), mapPadding());
