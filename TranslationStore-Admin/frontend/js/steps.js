// Editor das etapas de instalação/desinstalação (Especificação 01, §4.2).
import { h } from "./util.js";

export const STEP_TYPES = {
  downloadFile: { label: "Baixar arquivo", fields: [["file", "Arquivo no servidor (URL ou files/...)", "files"], ["output", "Salvar em (sdmc:/...)", "paths"], ["sha256", "sha256 (automático para arquivos enviados)", null]] },
  extractFile: { label: "Extrair arquivo", fields: [["file", "Arquivo compactado (sdmc:/...)", "paths"], ["output", "Extrair para a pasta (sdmc:/.../)", "paths"], ["input", "Só esta subpasta do arquivo (opcional)", null]] },
  copyFile: { label: "Copiar", fields: [["source", "Origem (pasta termina com /)", "paths"], ["destination", "Destino", "paths"]] },
  deleteFile: { label: "Apagar", fields: [["file", "Arquivo ou pasta (termina com /)", "paths"]] },
  installCia: { label: "Instalar CIA", fields: [["file", "Arquivo .cia (sdmc:/...)", "paths"]] },
  uninstallCia: { label: "Desinstalar CIA", fields: [["title_id", "Title ID do CIA (16 dígitos)", "titles"]] },
};

const FLAGS = {
  copyFile: [["overwrite", "Substituir se existir", true]],
  deleteFile: [["missing_ok", "Tudo bem se não existir", true]],
  installCia: [["delete_after", "Apagar o .cia depois", true]],
  uninstallCia: [["missing_ok", "Tudo bem se não estiver instalado", true]],
};

// ctx: { onChange(), pathSuggestions(), fileSuggestions() }
export function stepsEditor(steps, ctx) {
  const list = h("div.steps");
  const listId = "dl-" + Math.random().toString(36).slice(2);
  const pathList = h("datalist", { id: listId + "-paths" });
  const fileList = h("datalist", { id: listId + "-files" });
  const titleList = h("datalist", { id: listId + "-titles" });

  function refreshLists() {
    pathList.replaceChildren(...ctx.pathSuggestions().map((p) => h("option", { value: p })));
    fileList.replaceChildren(...ctx.fileSuggestions().map((p) => h("option", { value: p })));
    titleList.replaceChildren(...(ctx.titleSuggestions ? ctx.titleSuggestions() : [])
      .map(([value, label]) => h("option", { value }, label)));
  }

  function render() {
    refreshLists();
    list.replaceChildren();
    if (!steps.length) list.append(h("div.muted.small", {}, "Nenhuma etapa."));
    steps.forEach((step, index) => list.append(renderStep(step, index)));
  }

  function renderStep(step, index) {
    const type = STEP_TYPES[step.type] ? step.type : "downloadFile";
    step.type = type;
    const typeSelect = h("select", {
      onchange: (e) => { step.type = e.target.value; ctx.onChange(); render(); },
    }, Object.entries(STEP_TYPES).map(([key, t]) => h("option", { value: key, selected: key === type }, t.label)));
    const label = h("input", {
      placeholder: "Texto na tela do 3DS (opcional)", value: step.label || "",
      oninput: (e) => { step.label = e.target.value; ctx.onChange(); },
    });
    const move = (delta) => {
      const target = index + delta;
      if (target < 0 || target >= steps.length) return;
      [steps[index], steps[target]] = [steps[target], steps[index]];
      ctx.onChange(); render();
    };
    const fields = STEP_TYPES[type].fields.map(([key, text, suggest]) => h("label.field", {},
      text,
      h("input", {
        value: step[key] || "",
        list: suggest === "files" ? listId + "-files" : suggest === "paths" ? listId + "-paths"
          : suggest === "titles" ? listId + "-titles" : null,
        placeholder: key === "title_id" ? "0004000E00055D00" : suggest === "paths" ? "sdmc:/" : "",
        maxlength: key === "title_id" ? "16" : null,
        oninput: (e) => {
          let value = e.target.value.trim();
          if (key === "title_id") { value = value.toUpperCase(); e.target.value = value; }
          step[key] = value;
          ctx.onChange();
        },
      })));
    const flags = [["optional", "Etapa opcional (se falhar, continua)", false], ...(FLAGS[type] || [])]
      .map(([key, text, fallback]) => h("label", {},
        h("input", {
          type: "checkbox", checked: step[key] === undefined ? fallback : step[key],
          onchange: (e) => { step[key] = e.target.checked; ctx.onChange(); },
        }), text));
    return h("div.step", {},
      h("div.step-head", {},
        h("span.step-num", {}, index + 1 + "."),
        typeSelect, label,
        h("button.icon", { title: "Subir", onclick: () => move(-1), disabled: index === 0 }, "↑"),
        h("button.icon", { title: "Descer", onclick: () => move(1), disabled: index === steps.length - 1 }, "↓"),
        h("button.icon.danger", { title: "Remover", onclick: () => { steps.splice(index, 1); ctx.onChange(); render(); } }, "✕")),
      h("div.step-fields", {}, fields),
      h("div.step-flags", {}, flags));
  }

  const add = (step) => { steps.push(step); ctx.onChange(); render(); };
  const addMenu = h("select", {
    onchange: (e) => {
      if (e.target.value) add({ type: e.target.value });
      e.target.value = "";
    },
  }, h("option", { value: "" }, "+ Adicionar etapa…"),
    Object.entries(STEP_TYPES).map(([key, t]) => h("option", { value: key }, t.label)));
  addMenu.style.width = "220px";

  const element = h("div", {}, pathList, fileList, titleList, list,
    h("div.toolbar", {}, addMenu, ...(ctx.templates ? ctx.templates(add) : [])));
  render();
  return { element, render, add };
}
