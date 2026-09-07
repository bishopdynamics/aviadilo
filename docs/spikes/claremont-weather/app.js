"use strict";

(() => {
  const byId = (id) => document.getElementById(id);
  const data = window.SPIKE_DATA;
  const grid = byId("sources");
  const dialog = byId("lightbox");
  let imageTrigger = null;

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  const date = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const formatTime = (value) => {
    const parsed = date(value);
    return parsed ? new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric",
      minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short",
    }).format(parsed) : "Not supplied";
  };

  // Only bundled image paths are eligible for automatic loading.
  const localImage = (value) => {
    if (typeof value !== "string") return null;
    if (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
    return /^assets\/[a-zA-Z0-9_/-]+\.(png|jpe?g)$/i.test(value) &&
      !value.split("/").includes("..") ? value : null;
  };
  const sourceLink = (value) => {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };
  const list = (items, className) => {
    const ul = make("ul", className);
    for (const item of Array.isArray(items) ? items : []) ul.append(make("li", "", item));
    return ul;
  };

  const unavailableImage = (message) => {
    const block = make("div", "unavailable-image");
    block.append(make("p", "eyebrow", "SOURCE UNAVAILABLE"),
      make("h4", "", "No image to compare"),
      make("p", "", message || "This source did not supply a usable image for the saved comparison."));
    return block;
  };

  const enlarge = (snapshot, path, trigger) => {
    imageTrigger = trigger;
    byId("lightbox-title").textContent = snapshot.name;
    byId("lightbox-caption").textContent = `${snapshot.product || "Saved image"} · Valid ${formatTime(snapshot.validAt)}`;
    byId("lightbox-image").alt = `${snapshot.name}: ${snapshot.product || snapshot.kind}, centered on Claremont, California`;
    byId("lightbox-image").src = path;
    dialog.showModal();
    byId("close-lightbox").focus();
  };
  byId("close-lightbox").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    byId("lightbox-image").removeAttribute("src");
    if (imageTrigger?.isConnected) imageTrigger.focus();
    imageTrigger = null;
  });

  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.snapshots)) {
    byId("missing-data").hidden = false;
    return;
  }

  document.title = data.title || "Claremont weather source comparison";
  byId("location").textContent = data.location?.name || "Claremont, California";
  if (data.summary) byId("summary").textContent = data.summary;
  const captured = date(data.capturedAt);
  if (captured) {
    byId("capture-date").textContent = new Intl.DateTimeFormat("en-US", {
      month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles",
    }).format(captured);
    byId("capture-time").textContent = new Intl.DateTimeFormat("en-US", {
      hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short",
    }).format(captured) + " · One-time capture";
  }
  if (Number.isFinite(data.location?.latitude) && Number.isFinite(data.location?.longitude)) {
    byId("coordinates").textContent = `${data.location.latitude.toFixed(4)}°, ${data.location.longitude.toFixed(4)}°`;
  }
  byId("extent").textContent = data.extent?.description || "Shared geographic extent";
  byId("source-total").textContent = `${data.snapshots.length} saved source records`;
  byId("study-details").hidden = false;

  const cards = [];
  for (const snapshot of data.snapshots) {
    const kind = snapshot.kind === "wind" ? "wind" : "radar";
    const path = snapshot.status === "ok" ? localImage(snapshot.image) : null;
    const card = make("article", "source-card");
    const heading = make("div", "card-heading");
    const labels = make("div", "card-label-row");
    const status = make("span", `status${path ? "" : " unavailable"}`, path ? "Saved image" : "Unavailable");
    labels.append(make("span", `kind ${kind}`, kind.toUpperCase()), status);
    heading.append(labels, make("h3", "", snapshot.name), make("p", "product", snapshot.product));
    card.append(heading);

    if (path) {
      const button = make("button", "image-button");
      button.type = "button";
      button.setAttribute("aria-label", `Enlarge ${snapshot.name} image`);
      button.setAttribute("aria-haspopup", "dialog");
      const img = make("img", "source-image");
      img.alt = `${snapshot.name}: ${snapshot.product || kind}, centered on Claremont, California`;
      img.addEventListener("error", () => {
        button.replaceWith(unavailableImage("The saved image file could not be opened. Keep the assets folder with this page."));
        status.textContent = "Image file missing";
        status.classList.add("unavailable");
      }, { once: true });
      img.src = path;
      const label = make("span", "enlarge-label", "Enlarge ↗");
      label.setAttribute("aria-hidden", "true");
      button.append(img, label);
      button.addEventListener("click", () => enlarge(snapshot, path, button));
      card.append(button);
    } else {
      card.append(unavailableImage(snapshot.error));
    }

    const body = make("div", "card-body");
    const facts = make("dl", "image-facts");
    for (const [label, value] of [
      ["Image valid", formatTime(snapshot.validAt)],
      ["Resolution", snapshot.resolution || "Not supplied"],
      ["Captured", formatTime(snapshot.capturedAt)],
      ["Units", snapshot.units || "Not supplied"],
    ]) {
      const fact = make("div");
      fact.append(make("dt", "", label), make("dd", "", value));
      facts.append(fact);
    }
    body.append(facts);
    if (snapshot.description) body.append(make("p", "description", snapshot.description));
    if (Array.isArray(snapshot.notes) && snapshot.notes.length) body.append(list(snapshot.notes, "card-notes"));
    const footer = make("div", "card-footer");
    footer.append(make("p", "attribution", snapshot.attribution || "Attribution not supplied"));
    const url = sourceLink(snapshot.sourceUrl);
    if (url) {
      const link = make("a", "source-link", "Source ↗");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", `${snapshot.name} source (opens in a new tab)`);
      footer.append(link);
    }
    body.append(footer);
    card.append(body);
    grid.append(card);
    cards.push({ card, kind });
  }

  const filters = [...document.querySelectorAll("[data-filter]")];
  for (const filter of filters) {
    const kind = filter.dataset.filter;
    byId(`${kind}-count`).textContent = String(cards.filter((entry) => kind === "all" || entry.kind === kind).length);
    filter.addEventListener("click", () => {
      for (const other of filters) {
        const active = other === filter;
        other.classList.toggle("active", active);
        other.setAttribute("aria-pressed", String(active));
      }
      let count = 0;
      for (const entry of cards) {
        entry.card.hidden = kind !== "all" && entry.kind !== kind;
        if (!entry.card.hidden) count += 1;
      }
      byId("empty-state").hidden = count !== 0;
      byId("results-status").textContent = `Showing ${count} ${kind === "all" ? "weather" : kind} source${count === 1 ? "" : "s"}.`;
    });
  }
  byId("filters").hidden = false;
  byId("empty-state").hidden = cards.length !== 0;
  if (Array.isArray(data.notes) && data.notes.length) {
    const notes = byId("notes-list");
    for (const note of data.notes) notes.append(make("li", "", note));
    byId("study-notes").hidden = false;
  }
})();
