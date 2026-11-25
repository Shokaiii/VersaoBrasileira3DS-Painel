// Navegação e páginas: Jogos, Gerar catálogo, Configurações, Importar.
import { api, h, toast, field, slugify, SLUG } from "./util.js";
import { gameEditor, hasUnsaved, clearUnsaved } from "./editor.js";

const main = document.getElementById("main");
const PLATFORM_NAMES = { "3ds": "3DS", nds: "DS", dsiware: "DSiWare", gba: "GBA", "virtual-console": "Virtual Console" };

async function refreshBadge() {
  try {
    const s = await api("GET", "/api/settings");
    document.getElementById("version-badge").textContent =
      `Catálogo v${s.catalog_version}` + (s.last_generated ? ` · gerado ${new Date(s.last_generated).toLocaleString("pt-BR")}` : "");
  } catch { /* painel ainda iniciando */ }
}

// --- Jogos ---------------------------------------------------------------------

async function gamesPage() {
  const games = await api("GET", "/api/games");
  const search = h("input", { placeholder: "Buscar jogo…", style: "max-width:260px" });
  const grid = h("div.game-grid");
  const fold = (s) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const render = () => {
    const term = fold(search.value);
    const shown = games.filter((g) => fold(g.name).includes(term) || g.id.includes(term));
    grid.replaceChildren(...shown.map((g) => h("a.game-card", { href: `#/jogo/${g.id}` },
      g.icon ? h("img", { src: g.icon, alt: "" }) : h("div.noimg", {}, "sem ícone"),
      h("div", {}, h("strong", {}, g.name),
        h("span.tag.blue", {}, PLATFORM_NAMES[g.platform] || g.platform),
        h("span.tag", {}, g.translations === 1 ? "1 tradução" : `${g.translations} traduções`)))));
    if (!shown.length) grid.append(h("div.empty", {}, games.length ? "Nenhum jogo encontrado." : "Nenhum jogo cadastrado ainda."));
  };
  search.addEventListener("input", render);
  render();
  main.replaceChildren(
    h("div.page-head", {}, h("h1", {}, "Jogos"), h("span.muted", {}, `${games.length} cadastrados`),
      h("span.spacer"), search, h("button.primary", { onclick: newGameDialog }, "+ Novo jogo")),
    grid);
}

function newGameDialog() {
  const name = h("input", { placeholder: "Nome do jogo" });
  const id = h("input", { placeholder: "identificador-do-jogo" });
  let touched = false;
  name.addEventListener("input", () => { if (!touched) id.value = slugify(name.value); });
  id.addEventListener("input", () => { touched = true; });
  const platform = h("select", {},
    [["3ds", "Nintendo 3DS"], ["nds", "Nintendo DS"], ["dsiware", "DSiWare"], ["gba", "Game Boy Advance"], ["virtual-console", "Virtual Console"]]
      .map(([v, l]) => h("option", { value: v }, l)));
  const back = h("div.modal-back");
  const create = async () => {
    const gid = id.value.trim();
    if (!name.value.trim()) return toast("Digite o nome do jogo.", true);
    if (!SLUG.test(gid)) return toast("Identificador inválido: use letras minúsculas, números e hífens.", true);
    try {
      await api("POST", "/api/games", { id: gid, name: name.value.trim(), platform: platform.value });
      back.remove();
      location.hash = `#/jogo/${gid}`;
    } catch (error) { toast(error.message, true); }
  };
  back.append(h("div.modal", { style: "width:min(480px,94vw)" },
    h("h2", {}, "Novo jogo"),
    h("div.grid", {},
      field("Nome", name),
      field("Identificador (não muda depois)", id),
      field("Plataforma", platform)),
    h("div.toolbar", { style: "margin-top:16px" },
      h("button.primary", { onclick: create }, "Criar"),
      h("button", { onclick: () => back.remove() }, "Cancelar"))));
  document.body.append(back);
  name.focus();
}

// --- Gerar catálogo ------------------------------------------------------------

function problemList(problems) {
  if (!problems.length) return h("div.ok-box", {}, "Nenhum problema encontrado.");
  return h("ul.problems", {}, problems.map((p) => h("li", { class: p.level },
    h("b", {}, (p.level === "error" ? "Erro — " : "Aviso — ") + p.where + ": "), p.message)));
}

function nextVersion(version, part) {
  const [a, b, c] = version.split(".").map((x) => parseInt(x, 10) || 0);
  if (part === "major") return `${a + 1}.0.0`;
  if (part === "minor") return `${a}.${b + 1}.0`;
  if (part === "patch") return `${a}.${b}.${c + 1}`;
  return `${a}.${b}.${c}`;
}

async function generatePage() {
  const settings = await api("GET", "/api/settings");
  const appVersion = (await api("GET", "/api/app")).version || "?";
  const check = await api("GET", "/api/validate");
  const errors = check.problems.filter((p) => p.level === "error").length;
  const bump = h("select", {},
    h("option", { value: "patch" }, "Correção (último número)"),
    h("option", { value: "minor" }, "Novidade (número do meio)"),
    h("option", { value: "major" }, "Grande mudança (primeiro número)"),
    h("option", { value: "none" }, "Manter a versão"));
  const next = h("strong");
  const updateNext = () => { next.textContent = nextVersion(settings.catalog_version, bump.value); };
  bump.addEventListener("change", updateNext);
  updateNext();
  const result = h("div");
  const button = h("button.primary", {
    disabled: errors > 0,
    onclick: async () => {
      button.disabled = true;
      try {
        const r = await api("POST", "/api/generate", { bump: bump.value });
        if (!r.ok) {
          result.replaceChildren(h("h3", {}, "Não foi possível gerar"), problemList(r.problems));
        } else {
          result.replaceChildren(
            h("div.ok-box", {}, `Catálogo ${r.version} gerado: ${r.games} jogos, ${r.translations} traduções, ${r.images} imagens, ${r.files} arquivos.` +
              (r.app ? ` Aplicativo ${r.app} publicado.` : "")),
            h("p", {}, "Envie todo o conteúdo da pasta ", h("code", {}, r.output),
              " para ", h("code", {}, settings.base_url), " no servidor (version.json, catalog.json, images/, files/" + (r.app ? " e app/" : "") + ")."),
            h("button", { onclick: () => api("POST", "/api/open-output").catch((e) => toast(e.message, true)) }, "Abrir a pasta output"));
          toast(`Catálogo ${r.version} gerado.`);
          settings.catalog_version = r.version;
          updateNext();
          refreshBadge();
        }
      } catch (error) { toast(error.message, true); }
      button.disabled = errors > 0;
    },
  }, "Gerar catálogo");
  const previewBox = h("div");
  main.replaceChildren(
    h("div.page-head", {}, h("h1", {}, "Gerar catálogo")),
    h("section.card", {},
      h("div.grid.g3", {},
        field("Versão atual", h("input", { value: settings.catalog_version, readonly: true })),
        field("Nova versão", bump),
        field("Resultado", h("div", { style: "padding:8px 0" }, "versão ", next))),
      h("p.muted.small", {}, "O 3DS só baixa o catálogo novo quando a versão aumenta."),
      h("p.small", {}, settings.app_publish
        ? `Aplicativo: a versão ${appVersion} vai junto${settings.app_required === "sim" ? " (atualização obrigatória)" : ""}.`
        : "Aplicativo: não será publicado (ative em Configurações)."),
      h("div.toolbar", {}, button,
        h("button", {
          onclick: async () => {
            const catalog = await api("GET", "/api/preview");
            previewBox.replaceChildren(h("pre.json", {}, JSON.stringify(catalog, null, 2)));
          },
        }, "Ver catalog.json")),
      result),
    h("section.card", {},
      h("div.card-head", {}, h("h2", {}, "Verificação"), h("span.spacer"),
        h("span.muted.small", {}, `${check.games} jogos · ${errors} erro(s)`)),
      problemList(check.problems)),
    previewBox);
}

// --- Configurações -------------------------------------------------------------

async function settingsPage() {
  const s = await api("GET", "/api/settings");
  const base = h("input", { value: s.base_url });
  const catalogUrl = h("input", { value: s.catalog_url, placeholder: s.base_url + "catalog.json" });
  const version = h("input", { value: s.catalog_version });
  const app = await api("GET", "/api/app");
  const publish = h("input", { type: "checkbox", checked: !!s.app_publish });
  const required = h("select", {},
    h("option", { value: "nao" }, "Não — o usuário pode abrir sem atualizar"),
    h("option", { value: "sim" }, "Sim — o app só abre depois de atualizar"));
  required.value = s.app_required === "sim" ? "sim" : "nao";
  const notes = h("textarea", { rows: 4, placeholder: "Uma novidade por linha" }, (s.app_notes || []).join("\n"));
  const fileLine = (kind) => {
    const f = app.files[kind];
    if (!f) return h("li", {}, `VersaoBrasileira.${kind}: não encontrado`);
    return h("li", {}, `VersaoBrasileira.${kind}: ${(f.size / 1048576).toFixed(2)} MiB, compilado em ${f.modified}`,
      f.outdated ? h("b", { style: "color:#b8621a" }, " — mais antigo que o VERSION, compile de novo") : "");
  };
  const save = async () => {
    try {
      await api("PUT", "/api/settings", {
        base_url: base.value.trim(), catalog_url: catalogUrl.value.trim(), catalog_version: version.value.trim(),
        app_publish: publish.checked, app_required: required.value,
        app_notes: notes.value.split("\n").map((n) => n.trim()).filter(Boolean),
      });
      toast("Configurações salvas.");
      refreshBadge();
    } catch (error) { toast(error.message, true); }
  };
  main.replaceChildren(
    h("div.page-head", {}, h("h1", {}, "Configurações")),
    h("section.card", {},
      h("div.grid", {},
        field("Endereço do servidor (base_url)", base),
        h("p.muted.small", { style: "margin:-4px 0 0" }, "Pasta no servidor onde ficam version.json, catalog.json, images/ e files/. O app usa este endereço para baixar imagens e arquivos."),
        field("Endereço do catalog.json (opcional)", catalogUrl),
        field("Versão do catálogo", version)),
      h("div.toolbar", { style: "margin-top:14px" },
        h("button.primary", { onclick: save }, "Salvar"))),
    h("section.card", {},
      h("h2", {}, "Aplicativo"),
      h("p", {}, "Versão no projeto (TranslationStore\\VERSION): ", h("strong", {}, app.version || "não encontrada")),
      h("ul.small", {}, fileLine("3dsx"), fileLine("cia")),
      h("div.grid", {},
        h("label.checks", {}, publish, "Publicar esta versão do aplicativo ao gerar o catálogo"),
        field("Atualização obrigatória", required),
        field("Novidades (aparecem na janela de atualização no 3DS)", notes)),
      h("p.muted.small", {}, "O 3DS só oferece a atualização quando esta versão é maior que a instalada. Os arquivos vão para output/app/."),
      h("div.toolbar", { style: "margin-top:14px" },
        h("button.primary", { onclick: save }, "Salvar"))),
    h("section.card", {},
      h("h2", {}, "No 3DS"),
      h("p", {}, "O aplicativo procura o version.json em:"),
      h("pre.json", {}, (s.base_url || "") + "version.json"),
      h("p.muted.small", {}, "Esse é o endereço em Ajustes → Servidor do Catálogo no 3DS.")));
}

// --- Importar ------------------------------------------------------------------

function importPage() {
  const file = h("input", { type: "file", accept: ".json,application/json" });
  const folder = h("input", { placeholder: "Ex.: E:\\Projetos\\Tradução\\3DS Homebrew - VersãoBrasileira\\servidor\\versaobrasileira" });
  const replace = h("input", { type: "checkbox", checked: true });
  const result = h("div");
  main.replaceChildren(
    h("div.page-head", {}, h("h1", {}, "Importar catálogo")),
    h("section.card", {},
      h("p", {}, "Traz um catalog.json existente para o painel. Se informar a pasta onde ele está, as imagens e os arquivos das traduções vêm junto."),
      h("div.grid", {},
        field("catalog.json", file),
        field("Pasta com images/ e files/ (opcional)", folder),
        h("label.checks", {}, replace, "Apagar os cadastros atuais do painel antes de importar")),
      h("div.toolbar", { style: "margin-top:14px" },
        h("button.primary", {
          onclick: async () => {
            if (!file.files[0]) return toast("Escolha o catalog.json.", true);
            if (replace.checked && !confirm("Apagar os cadastros atuais e importar?")) return;
            const form = new FormData();
            form.append("file", file.files[0]);
            form.append("folder", folder.value);
            form.append("replace", replace.checked ? "true" : "false");
            try {
              const r = await api("POST", "/api/import", form, true);
              result.replaceChildren(h("div.ok-box", {},
                `Importados: ${r.games} jogos, ${r.translations} traduções, ${r.images} imagens, ${r.files} arquivos.`),
                r.missing.length ? h("ul.problems", { style: "margin-top:10px" },
                  r.missing.map((m) => h("li.warning", {}, "Não encontrado: " + m))) : null);
              refreshBadge();
            } catch (error) { toast(error.message, true); }
          },
        }, "Importar")),
      result));
}

// --- Navegação -----------------------------------------------------------------

let currentHash = location.hash;
async function route() {
  if (hasUnsaved() && location.hash !== currentHash) {
    if (!confirm("Há alterações não salvas. Sair mesmo assim?")) {
      history.replaceState(null, "", currentHash);
      return;
    }
    clearUnsaved();
  }
  currentHash = location.hash;
  const [, page, arg] = (location.hash || "#/jogos").split("/");
  document.querySelectorAll(".sidebar nav a").forEach((a) =>
    a.classList.toggle("active", a.dataset.page === (page === "jogo" ? "jogos" : page)));
  main.onkeydown = null;
  try {
    if (page === "jogo" && arg) await gameEditor(main, decodeURIComponent(arg));
    else if (page === "gerar") await generatePage();
    else if (page === "configuracoes") await settingsPage();
    else if (page === "importar") importPage();
    else await gamesPage();
  } catch (error) {
    main.replaceChildren(h("div.empty", {}, "Erro: " + error.message));
  }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
route();
refreshBadge();
