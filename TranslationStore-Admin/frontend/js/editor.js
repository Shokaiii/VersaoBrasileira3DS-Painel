// Editor de um jogo: dados, imagens e traduções.
import { api, h, toast, field, bytes, slugify, SLUG, listToText, textToList } from "./util.js";
import { cropImage } from "./cropper.js";
import { stepsEditor } from "./steps.js";

const PLATFORMS = [["3ds", "Nintendo 3DS"], ["nds", "Nintendo DS"], ["dsiware", "DSiWare"],
  ["gba", "Game Boy Advance"], ["virtual-console", "Virtual Console"]];
const REGIONS = ["USA", "EUR", "JPN", "KOR", "CHN", "TWN", "ALL"];
const REQUIREMENTS = [["luma3ds", "Luma3DS"], ["layeredfs", "LayeredFS"], ["twilightmenu", "TWiLight Menu++"]];
const TMP = "sdmc:/3ds/VersaoBrasileira/tmp/";

let dirty = false;
window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
export function hasUnsaved() { return dirty; }
export function clearUnsaved() { dirty = false; }

export async function gameEditor(main, gameId) {
  let game;
  try {
    game = await api("GET", `/api/games/${encodeURIComponent(gameId)}`);
  } catch (error) {
    main.replaceChildren(h("div.empty", {}, error.message));
    return;
  }
  const savedTranslations = new Set((game.translations || []).map((t) => t.id));
  let images = game._images || {};
  delete game._images;
  game.title_ids = game.title_ids || [];
  game.translations = game.translations || [];
  dirty = false;

  const dirtyLabel = h("span.dirty");
  const markDirty = () => { dirty = true; dirtyLabel.textContent = "Alterações não salvas"; };

  async function save() {
    for (const t of game.translations) {
      if (!SLUG.test(t.id || "")) {
        toast(`Identificador de tradução inválido: "${t.id}"`, true);
        return;
      }
    }
    try {
      const result = await api("PUT", `/api/games/${encodeURIComponent(game.id)}`, game);
      dirty = false;
      dirtyLabel.textContent = "";
      game.translations.forEach((t) => savedTranslations.add(t.id));
      renderTranslations();
      const errors = (result._problems || []).filter((p) => p.level === "error");
      if (errors.length) toast(`Salvo, com ${errors.length} problema(s). Veja em Gerar catálogo.`, true);
      else toast("Salvo.");
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function remove() {
    if (!confirm(`Apagar "${game.name}" e todas as suas traduções, imagens e arquivos do painel?`)) return;
    await api("DELETE", `/api/games/${encodeURIComponent(game.id)}`);
    dirty = false;
    toast("Jogo apagado.");
    location.hash = "#/jogos";
  }

  // --- Dados do jogo ---
  const input = (key, props = {}) => h("input", {
    value: game[key] ?? "", ...props,
    oninput: (e) => { game[key] = props.type === "number" ? (e.target.value ? Number(e.target.value) : null) : e.target.value; markDirty(); if (key === "name") title.textContent = game.name || game.id; },
  });
  const title = h("h1", {}, game.name || game.id);
  const titleIds = h("div.rows");
  function renderTitleIds() {
    titleIds.replaceChildren(...game.title_ids.map((t, i) => h("div.row", {},
      h("select.narrow", { onchange: (e) => { t.region = e.target.value; markDirty(); } },
        REGIONS.map((r) => h("option", { value: r, selected: r === t.region }, r))),
      h("input", {
        value: t.id || "", placeholder: "0004000000055D00", maxlength: "16",
        oninput: (e) => { t.id = e.target.value.trim().toUpperCase(); e.target.value = t.id; markDirty(); },
      }),
      h("button.icon.danger", { onclick: () => { game.title_ids.splice(i, 1); markDirty(); renderTitleIds(); } }, "✕"))),
      h("div", {}, h("button", { onclick: () => { game.title_ids.push({ region: "USA", id: "" }); markDirty(); renderTitleIds(); } }, "+ Title ID")));
  }
  renderTitleIds();

  const dataCard = h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "Dados do jogo")),
    h("div.grid.g4", {},
      field("Nome", input("name"), { class: "span2" }),
      field("Identificador", h("input", { value: game.id, readonly: true })),
      field("Plataforma", h("select", { onchange: (e) => { game.platform = e.target.value; markDirty(); } },
        PLATFORMS.map(([v, l]) => h("option", { value: v, selected: v === game.platform }, l)))),
      field("Editora", input("publisher"), { class: "span2" }),
      field("Ano", input("release_year", { type: "number", min: "1980", max: "2100" })),
      field("Gêneros (separados por vírgula)", h("input", {
        value: listToText(game.genres),
        oninput: (e) => { game.genres = textToList(e.target.value); markDirty(); },
      })),
      field("Descrição", h("textarea", { oninput: (e) => { game.description = e.target.value; markDirty(); } }, game.description || ""), { class: "span4" }),
      h("div.span4", {}, h("h3", {}, "Title IDs"), titleIds)));

  // --- Imagens ---
  const imageArea = h("div.images");
  function renderImages() {
    const box = (kind, labelText, w, hgt) => {
      const picker = h("input", { type: "file", accept: "image/*", style: "display:none" });
      picker.addEventListener("change", async () => {
        const file = picker.files[0];
        picker.value = "";
        if (!file) return;
        const result = await cropImage(file, kind);
        if (!result) return;
        const form = new FormData();
        form.append("file", result.file);
        form.append("mode", result.mode);
        if (result.crop) form.append("crop", JSON.stringify(result.crop));
        try {
          images = await api("POST", `/api/games/${encodeURIComponent(game.id)}/images/${kind}`, form, true);
          renderImages();
          toast(kind === "icon" ? "Ícone salvo." : "Capa salva.");
        } catch (error) { toast(error.message, true); }
      });
      const url = images[kind];
      return h("div.image-box", {},
        h("div.image-preview", { style: `width:${w * 2 + 16}px;height:${hgt * 2 + 16}px` },
          url ? h("img", { src: url, width: w * 2, height: hgt * 2 }) : h("span.muted.small", {}, "Sem imagem")),
        h("div.image-actions", {},
          h("strong", {}, labelText), h("span.muted.small", {}, `${w}×${hgt} no 3DS (mostrada ampliada 2×)`),
          h("button", { onclick: () => picker.click() }, url ? "Trocar imagem…" : "Escolher imagem…"),
          url && h("button.danger", {
            onclick: async () => {
              await api("DELETE", `/api/games/${encodeURIComponent(game.id)}/images/${kind}`);
              images = { ...images, [kind]: null };
              renderImages();
            },
          }, "Remover"),
          picker));
    };
    imageArea.replaceChildren(box("icon", "Ícone", 48, 48), box("cover", "Capa", 192, 128));
  }
  renderImages();
  const imageCard = h("section.card", {}, h("div.card-head", {}, h("h2", {}, "Imagens")), imageArea,
    h("p.muted.small", {}, "Qualquer imagem serve: o painel recorta e reduz para o tamanho exato do 3DS."));

  // --- Traduções ---
  const translationsBox = h("div");
  const open = new Set();
  function newTranslation() {
    let id = `${game.id}-ptbr`;
    let n = 2;
    while (game.translations.some((t) => t.id === id)) id = `${game.id}-ptbr-${n++}`;
    const regions = [...new Set(game.title_ids.map((t) => t.region))];
    game.translations.push({
      id, name: `${game.name} — Tradução PT-BR`, language: "pt-BR", version: "1.0.0",
      release_date: new Date().toISOString().slice(0, 10), authors: [{ name: "", role: "Tradução" }],
      description: "", changelog: [],
      compatibility: { regions, game_versions: [], consoles: "all", requirements: game.platform === "3ds" ? ["luma3ds"] : [], notes: "" },
      download_size: null, install_size: null, install: { steps: [] }, uninstall: { steps: [] },
    });
    open.add(id);
    markDirty();
    renderTranslations();
  }

  function renderTranslations() {
    translationsBox.replaceChildren(...game.translations.map((t, i) => translationCard(t, i)));
    if (!game.translations.length) translationsBox.append(h("div.muted", {}, "Nenhuma tradução ainda."));
  }

  function translationCard(t, index) {
    t.compatibility = t.compatibility || { regions: [], game_versions: [], consoles: "all", requirements: [], notes: "" };
    t.install = t.install || { steps: [] };
    t.install.steps = t.install.steps || [];
    t.uninstall = t.uninstall || { steps: [] };
    t.uninstall.steps = t.uninstall.steps || [];
    t.authors = t.authors || [];
    t.changelog = t.changelog || [];
    const saved = savedTranslations.has(t.id);
    const card = h("div.translation", { class: open.has(t.id) ? "open" : "" });
    const headName = h("strong", {}, t.name || t.id);
    const header = h("header", { onclick: () => { card.classList.toggle("open"); open[card.classList.contains("open") ? "add" : "delete"](t.id); } },
      h("span.chev", {}, "▶"), headName,
      h("span.tag", {}, "v" + (t.version || "?")),
      h("span.tag.blue", {}, `${t.install.steps.length} etapas`),
      h("span.spacer"),
      h("button.danger.icon", {
        onclick: (e) => {
          e.stopPropagation();
          if (!confirm(`Remover a tradução "${t.name}"?`)) return;
          game.translations.splice(index, 1);
          markDirty();
          renderTranslations();
        },
      }, "Remover"));

    const tin = (key, props = {}) => h("input", {
      value: t[key] ?? "", ...props,
      oninput: (e) => {
        t[key] = props.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value;
        if (key === "name") headName.textContent = t.name;
        markDirty();
      },
    });
    const idInput = h("input", {
      value: t.id, readonly: saved,
      title: saved ? "O identificador não muda depois de salvo (os arquivos enviados ficam ligados a ele)." : "",
      oninput: (e) => { open.delete(t.id); t.id = slugify(e.target.value) || e.target.value; open.add(t.id); markDirty(); },
      onchange: (e) => { e.target.value = t.id; },
    });

    // Equipe
    const authors = h("div.rows");
    const renderAuthors = () => authors.replaceChildren(...t.authors.map((a, i) => h("div.row", {},
      h("input", { value: a.name || "", placeholder: "Nome", oninput: (e) => { a.name = e.target.value; markDirty(); } }),
      h("input", { value: a.role || "", placeholder: "Função (Tradução, Revisão…)", oninput: (e) => { a.role = e.target.value; markDirty(); } }),
      h("button.icon.danger", { onclick: () => { t.authors.splice(i, 1); markDirty(); renderAuthors(); } }, "✕"))),
      h("div", {}, h("button", { onclick: () => { t.authors.push({ name: "", role: "" }); markDirty(); renderAuthors(); } }, "+ Pessoa")));
    renderAuthors();

    // Histórico
    const changelog = h("div.rows");
    const renderChangelog = () => changelog.replaceChildren(...t.changelog.map((c, i) => h("div.row", {},
      h("input.narrow", { value: c.version || "", placeholder: "1.0.0", oninput: (e) => { c.version = e.target.value; markDirty(); } }),
      h("input", { value: c.notes || "", placeholder: "O que mudou", oninput: (e) => { c.notes = e.target.value; markDirty(); } }),
      h("button.icon.danger", { onclick: () => { t.changelog.splice(i, 1); markDirty(); renderChangelog(); } }, "✕"))),
      h("div", {}, h("button", { onclick: () => { t.changelog.unshift({ version: t.version, notes: "" }); markDirty(); renderChangelog(); } }, "+ Versão")));
    renderChangelog();

    // Compatibilidade
    const compat = t.compatibility;
    const checks = (values, current, onChange) => h("div.checks", {}, values.map(([v, l]) => h("label", {},
      h("input", { type: "checkbox", checked: current.includes(v), onchange: (e) => onChange(v, e.target.checked) }), l)));
    const toggle = (list, value, on) => { const i = list.indexOf(value); if (on && i < 0) list.push(value); if (!on && i >= 0) list.splice(i, 1); markDirty(); };

    // Arquivos
    let files = [];
    const fileTable = h("tbody");
    const filePicker = h("input", { type: "file", multiple: true, style: "display:none" });
    const fileSuggestions = () => files.map((f) => f.server_path);
    const pathSuggestions = () => {
      const out = [TMP + t.id + "/"];
      for (const f of files) out.push(TMP + t.id + "/" + f.name);
      for (const tid of game.title_ids.filter((x) => x.id)) {
        out.push(`sdmc:/luma/titles/${tid.id}/`, `sdmc:/luma/titles/${tid.id}/romfs/`, `sdmc:/luma/titles/${tid.id}/code.bin`);
      }
      return out;
    };
    async function loadFiles() {
      if (!saved) { fileTable.replaceChildren(h("tr", {}, h("td.muted", { colspan: "4" }, "Salve o jogo antes de enviar arquivos para esta tradução."))); return; }
      try { files = await api("GET", `/api/files/${encodeURIComponent(t.id)}`); } catch { files = []; }
      fileTable.replaceChildren(...files.map((f) => h("tr", {},
        h("td", {}, h("strong", {}, f.name), h("br"), h("code", {}, f.server_path),
          f.cia_title_id ? [h("br"), h("span.tag.blue", {}, "Title ID " + f.cia_title_id)] : null),
        h("td", {}, bytes(f.size)),
        h("td", {}, h("code", {}, f.sha256.slice(0, 16) + "…")),
        h("td", {}, h("button.icon.danger", {
          onclick: async () => {
            if (!confirm(`Apagar ${f.name} do painel?`)) return;
            await api("DELETE", `/api/files/${encodeURIComponent(t.id)}/${encodeURIComponent(f.name)}`);
            loadFiles();
          },
        }, "✕")))));
      if (!files.length) fileTable.append(h("tr", {}, h("td.muted", { colspan: "4" }, "Nenhum arquivo enviado.")));
      install.render(); uninstall.render();
    }
    filePicker.addEventListener("change", async () => {
      for (const file of filePicker.files) {
        const form = new FormData();
        form.append("file", file);
        try {
          await api("POST", `/api/files/${encodeURIComponent(t.id)}`, form, true);
          toast(`${file.name} enviado.`);
        } catch (error) { toast(error.message, true); }
      }
      filePicker.value = "";
      loadFiles();
    });

    // Title IDs sugeridos para "Desinstalar CIA": os dos .cia enviados e,
    // para cada Title ID do jogo, o da atualização (0004000E) e o da DLC (0004008C).
    const titleSuggestions = () => {
      const out = [];
      for (const f of files) {
        if (f.cia_title_id) out.push([f.cia_title_id, `${f.name}`]);
      }
      for (const tid of game.title_ids.filter((x) => /^[0-9A-F]{16}$/.test(x.id || ""))) {
        const low = tid.id.slice(8);
        out.push([tid.id, `${tid.region} — jogo`], ["0004000E" + low, `${tid.region} — atualização`],
          ["0004008C" + low, `${tid.region} — DLC`]);
      }
      return out;
    };

    // Modelos prontos de etapas
    const templates = (add) => {
      const firstFile = () => files[0];
      const firstTid = () => (game.title_ids.find((x) => x.id) || {}).id || "0000000000000000";
      return [
        h("button", {
          title: "Baixar um .zip e extrair na pasta do LayeredFS do Luma3DS",
          onclick: () => {
            const f = firstFile();
            const name = f ? f.name : "patch.zip";
            add({ type: "downloadFile", file: f ? f.server_path : `files/${t.id}/${name}`, output: `${TMP}${t.id}/${name}` });
            add({ type: "extractFile", file: `${TMP}${t.id}/${name}`, output: `sdmc:/luma/titles/${firstTid()}/` });
          },
        }, "Modelo: LayeredFS"),
        h("button", {
          title: "Baixar um .cia e instalar",
          onclick: () => {
            const f = files.find((x) => x.name.toLowerCase().endsWith(".cia")) || firstFile();
            const name = f ? f.name : "patch.cia";
            add({ type: "downloadFile", file: f ? f.server_path : `files/${t.id}/${name}`, output: `${TMP}${t.id}/${name}` });
            add({ type: "installCia", file: `${TMP}${t.id}/${name}` });
            // A desinstalação do mesmo CIA, quando o Title ID é conhecido.
            if (f && f.cia_title_id && !t.uninstall.steps.some((s) => s.title_id === f.cia_title_id)) {
              uninstall.add({ type: "uninstallCia", title_id: f.cia_title_id });
            }
          },
        }, "Modelo: CIA"),
      ];
    };
    const uninstallTemplates = (add) => [
      h("button", {
        title: "Uma etapa Desinstalar CIA para cada .cia enviado",
        onclick: () => {
          const cias = files.filter((f) => f.cia_title_id);
          if (!cias.length) { toast("Nenhum .cia com Title ID entre os arquivos enviados.", true); return; }
          for (const f of cias) {
            if (!t.uninstall.steps.some((s) => s.title_id === f.cia_title_id)) {
              add({ type: "uninstallCia", title_id: f.cia_title_id });
            }
          }
        },
      }, "Modelo: desinstalar CIAs enviados"),
    ];
    const install = stepsEditor(t.install.steps, { onChange: () => { markDirty(); }, pathSuggestions, fileSuggestions, titleSuggestions, templates });
    const uninstall = stepsEditor(t.uninstall.steps, { onChange: markDirty, pathSuggestions, fileSuggestions, titleSuggestions, templates: uninstallTemplates });

    const body = h("div.body", {},
      h("div.section-title", {}, "Tradução"),
      h("div.grid.g4", {},
        field("Nome", tin("name"), { class: "span2" }),
        field("Identificador", idInput),
        field("Idioma", tin("language", { placeholder: "pt-BR" })),
        field("Versão da tradução", tin("version", { placeholder: "1.0.0" })),
        field("Lançamento", tin("release_date", { type: "date" })),
        field("Tamanho do download (bytes)", tin("download_size", { type: "number", min: "0", placeholder: "automático" })),
        field("Espaço após instalar (bytes)", tin("install_size", { type: "number", min: "0", placeholder: "igual ao download" })),
        field("Descrição", h("textarea", { oninput: (e) => { t.description = e.target.value; markDirty(); } }, t.description || ""), { class: "span4" })),
      h("div.section-title", {}, "Equipe"), authors,
      h("div.section-title", {}, "Compatibilidade"),
      h("div.grid.g2", {},
        field("Regiões", checks(REGIONS.map((r) => [r, r]), compat.regions, (v, on) => toggle(compat.regions, v, on))),
        field("Versão do jogo exigida (separe por vírgula)", h("input", {
          value: listToText(compat.game_versions), placeholder: "1.5",
          oninput: (e) => { compat.game_versions = textToList(e.target.value); markDirty(); },
        })),
        field("Consoles", h("select", { onchange: (e) => { compat.consoles = e.target.value; markDirty(); } },
          h("option", { value: "all", selected: compat.consoles !== "new3ds" }, "Todos os modelos"),
          h("option", { value: "new3ds", selected: compat.consoles === "new3ds" }, "Somente New 3DS / New 2DS XL"))),
        field("Requisitos", checks(REQUIREMENTS, compat.requirements, (v, on) => toggle(compat.requirements, v, on))),
        field("Observações", h("input", { value: compat.notes || "", oninput: (e) => { compat.notes = e.target.value; markDirty(); } }), { class: "span2" })),
      h("div.section-title", {}, "Histórico de versões"), changelog,
      h("div.section-title", {}, "Arquivos da tradução"),
      h("p.muted.small", {}, "Os arquivos enviados aqui vão para files/<identificador>/ no servidor. O sha256 e o tamanho são calculados sozinhos ao gerar o catálogo."),
      h("table.files", {}, h("thead", {}, h("tr", {}, h("th", {}, "Arquivo"), h("th", {}, "Tamanho"), h("th", {}, "sha256"), h("th"))), fileTable),
      h("div.toolbar", {}, h("button", { onclick: () => saved ? filePicker.click() : toast("Salve o jogo primeiro.", true) }, "Enviar arquivos…"), filePicker),
      h("div.section-title", {}, "Etapas de instalação"), install.element,
      h("div.section-title", {}, "Etapas de desinstalação (opcional)"),
      h("p.muted.small", {}, "Sem etapas aqui, o 3DS desinstala sozinho: apaga os arquivos e desinstala os CIAs que a instalação registrou. Com etapas, só elas são executadas — inclua \"Desinstalar CIA\" para cada CIA."),
      uninstall.element);
    card.append(header, body);
    loadFiles();
    return card;
  }
  renderTranslations();

  const translationsCard = h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "Traduções"), h("span.spacer"),
      h("button", { onclick: newTranslation }, "+ Nova tradução")),
    translationsBox);

  main.replaceChildren(
    h("div.savebar", {},
      h("a.button", { href: "#/jogos" }, "← Jogos"),
      title, h("span.spacer", { style: "flex:1" }), dirtyLabel,
      h("button.danger", { onclick: remove }, "Apagar jogo"),
      h("button.primary", { onclick: save }, "Salvar")),
    dataCard, imageCard, translationsCard);

  // Ctrl+S salva.
  main.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
  };
}
