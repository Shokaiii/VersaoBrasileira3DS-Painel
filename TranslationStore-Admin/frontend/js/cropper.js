// Recorte de imagem na proporção do aplicativo (ícone 1:1, capa 112:128),
// com prévia no tamanho real. Resolve com {file, crop, mode} ou null.
import { h } from "./util.js";

export function cropImage(file, kind) {
  const [W, H] = kind === "icon" ? [48, 48] : [112, 128];
  const ratio = W / H;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = h("img", { src: url, draggable: "false" });
    const rect = h("div.crop-rect");
    const area = h("div.crop-area", {}, img, rect);
    const preview = h("canvas", { width: W, height: H });
    const preview2 = h("canvas", { width: W * 2, height: H * 2 });
    const zoom = h("input", { type: "range", min: "10", max: "100", value: "100" });
    const modeSelect = h("select", {},
      h("option", { value: "fill" }, "Recortar (preencher)"),
      h("option", { value: "fit" }, "Imagem inteira (com bordas)"));
    let box = { x: 0, y: 0, w: 1, h: 1 }; // em pixels da imagem mostrada

    const close = (result) => { URL.revokeObjectURL(url); back.remove(); resolve(result); };

    function layout() {
      const iw = img.clientWidth, ih = img.clientHeight;
      const scale = zoom.value / 100;
      let w = iw, hgt = iw / ratio;
      if (hgt > ih) { hgt = ih; w = ih * ratio; }
      w *= scale; hgt *= scale;
      box.w = w; box.h = hgt;
      box.x = Math.min(Math.max(0, box.x), iw - w);
      box.y = Math.min(Math.max(0, box.y), ih - hgt);
      Object.assign(rect.style, { left: box.x + "px", top: box.y + "px", width: w + "px", height: hgt + "px" });
      const fit = modeSelect.value === "fit";
      rect.style.display = fit ? "none" : "block";
      for (const canvas of [preview, preview2]) {
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const sx = img.naturalWidth / iw;
        if (fit) {
          const s = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
          const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
          ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
        } else {
          ctx.drawImage(img, box.x * sx, box.y * sx, box.w * sx, box.h * sx, 0, 0, canvas.width, canvas.height);
        }
      }
    }

    let drag = null;
    rect.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, bx: box.x, by: box.y };
      rect.setPointerCapture(e.pointerId);
    });
    rect.addEventListener("pointermove", (e) => {
      if (!drag) return;
      box.x = drag.bx + e.clientX - drag.x;
      box.y = drag.by + e.clientY - drag.y;
      layout();
    });
    rect.addEventListener("pointerup", () => { drag = null; });
    zoom.addEventListener("input", layout);
    modeSelect.addEventListener("change", layout);
    img.addEventListener("load", () => {
      // Começa centralizado.
      box.x = img.clientWidth; box.y = img.clientHeight;
      layout();
      box.x = (img.clientWidth - box.w) / 2;
      box.y = (img.clientHeight - box.h) / 2;
      layout();
    });

    const ok = h("button.primary", {
      onclick: () => {
        const iw = img.clientWidth, ih = img.clientHeight;
        const crop = modeSelect.value === "fit" ? null
          : { x: box.x / iw, y: box.y / ih, w: box.w / iw, h: box.h / ih };
        close({ file, crop, mode: modeSelect.value });
      },
    }, "Usar imagem");
    const cancel = h("button", { onclick: () => close(null) }, "Cancelar");
    const back = h("div.modal-back", {},
      h("div.modal", {},
        h("h2", {}, kind === "icon" ? "Ícone (48×48)" : "Capa (112×128)"),
        h("div.crop-layout", {},
          area,
          h("div.crop-side", {},
            h("label.field", {}, "Modo", modeSelect),
            h("label.field", {}, "Tamanho do recorte", zoom),
            h("div.muted.small", {}, "Arraste o quadro amarelo para escolher a parte da imagem."),
            h("div.small.muted", {}, "Tamanho real:"), preview,
            h("div.small.muted", {}, "Ampliada 2×:"), preview2,
            h("div.row", {}, ok, cancel)))));
    document.body.append(back);
  });
}
