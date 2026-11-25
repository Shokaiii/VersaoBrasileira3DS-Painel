// Utilidades: chamadas à API, criação de elementos e avisos.

export async function api(method, url, body, isForm = false) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    if (isForm) {
      options.body = body;
    } else {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
  }
  const response = await fetch(url, options);
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    const detail = data && data.detail;
    throw new Error(typeof detail === "string" ? detail : `Erro ${response.status}`);
  }
  return data;
}

// h("div.card", {onclick}, filhos...)
export function h(spec, props = {}, ...children) {
  const [tag, ...classes] = spec.split(".");
  const el = document.createElement(tag || "div");
  if (classes.length) el.className = classes.join(" ");
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "value") el.value = value;
    else if (key === "checked") el.checked = !!value;
    else if (key === "html") el.innerHTML = value;
    else if (key === "class") el.className += " " + value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function toast(message, error = false) {
  const el = h("div.toast", { class: error ? "error" : "" }, message);
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), error ? 6000 : 3000);
}

export function bytes(n) {
  if (n === null || n === undefined || n === "") return "—";
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = Number(n);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return (i === 0 ? value : value.toFixed(2).replace(".", ",")) + " " + units[i];
}

// "Pokémon X: Edição" -> "pokemon-x-edicao"
export function slugify(text) {
  return (text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function field(label, input, extra = {}) {
  return h("label.field", extra, label, input);
}

export function listToText(list) { return (list || []).join(", "); }
export function textToList(text) {
  return (text || "").split(",").map((s) => s.trim()).filter(Boolean);
}
