import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

const express={Router(){const routes=[];return {
get(pattern,handler){const keys=[];const re=pattern.split('/').map(p=>{if(!p.startsWith(':'))return p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=p.match(/^:([\w]+)(.*)$/);keys.push(m[1]);return '([^/]+?)'+m[2].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('/');routes.push({re:new RegExp('^'+re+'$'),keys,handler});},
async handle(path,url){for(const r of routes){const m=path.match(r.re);if(!m)continue;let response,status=200;const headers=new Headers();const res={headersSent:false,status(n){status=n;return this;},setHeader(k,v){headers.set(k,String(v));return this;},send(body){response=new Response(body,{status,headers});this.headersSent=true;return this;},sendStatus(n){status=n;return this.send(String(n));}};await r.handler({params:Object.fromEntries(r.keys.map((k,i)=>[k,decodeURIComponent(m[i+1])])),query:Object.fromEntries(url.searchParams)},res);return response||new Response('Empty response',{status:500});}return null;}
};}};


function createCam4(PUBLIC_URL) {
  const router = express.Router();
  const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
  const PREFIX = "cam4:";
  const MAX_PAGES = 15;
  let cache = { t: 0, data: [] };
  const thumb = user => PUBLIC_URL + "/cam4/imagem/" + encodeURIComponent(user) + ".jpg";
  async function getJson(url) {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async function listarOnline() {
    if (Date.now() - cache.t < 60000 && cache.data.length) return cache.data;
    const base = "https://pt.cam4.com/directoryCams?directoryJson=true&online=true&url=true&gender=male";
    const vistos = new Map();
    for (let inicio = 1; inicio <= MAX_PAGES; inicio += 5) {
      const lote = [];
      for (let pagina = inicio; pagina < inicio + 5 && pagina <= MAX_PAGES; pagina++) {
        lote.push(getJson(base + "&page=" + pagina).catch(e => {
          console.error("[CAM4 catálogo]", e.message);
          return null;
        }));
      }
      const respostas = await Promise.all(lote);
      let vazias = 0;
      for (const resposta of respostas) {
        const users = Array.isArray(resposta?.users) ? resposta.users : [];
        if (!users.length) { vazias++; continue; }
        for (const user of users) {
          const nome = String(user.username || "").trim();
          if (String(user.countryCode || "").toLowerCase() !== "br" || !nome || vistos.has(nome)) continue;
          vistos.set(nome, { username: nome, viewers: Number(user.viewers) || 0, title: user.statusMessage || "" });
        }
      }
      if (vazias === respostas.length) break;
    }
    cache = { t: Date.now(), data: [...vistos.values()] };
    return cache.data;
  }
  async function catalog({ extra = {} }) {
    try {
      let users = await listarOnline();
      if (extra.search) {
        const search = String(extra.search).toLowerCase();
        users = users.filter(u => u.username.toLowerCase().includes(search));
      }
      const skip = Math.max(0, parseInt(extra.skip, 10) || 0);
      return { metas: users.slice(skip, skip + 100).map(u => ({
        id: PREFIX + u.username, type: "tv", name: u.username,
        poster: thumb(u.username), background: thumb(u.username), posterShape: "landscape",
        description: u.viewers + " espectadores. " + u.title
      })) };
    } catch (e) { console.error("[CAM4 catálogo]", e.message); return { metas: [] }; }
  }
  async function meta({ id }) {
    const user = id.slice(PREFIX.length);
    return { meta: { id, type: "tv", name: user, poster: thumb(user), background: thumb(user),
      posterShape: "landscape", behaviorHints: { isLive: true } } };
  }
  async function stream({ id }) {
    const user = id.slice(PREFIX.length);
    try {
      const data = await getJson("https://www.cam4.com/rest/v1.0/profile/" + encodeURIComponent(user) + "/streamInfo");
      if (typeof data.cdnURL !== "string" || !data.cdnURL) return { streams: [] };
      return { streams: [{ name: "CAM4", title: "Ao vivo (HLS)", url: data.cdnURL,
        behaviorHints: { notWebReady: true, proxyHeaders: { request: {
          "User-Agent": UA, Referer: "https://www.cam4.com/"
        } } } }] };
    } catch (e) { console.error("[CAM4 stream]", user, e.message); return { streams: [] }; }
  }
  router.get("/imagem/:usuario.jpg", async (req, res) => {
    try {
      const user = String(req.params.usuario || "").trim();
      if (!user || user.length > 100 || user.includes("/") || user.includes("..")) return res.sendStatus(400);
      const r = await fetch("https://snapshots.xcdnpro.com/thumbnails/" + encodeURIComponent(user), {
        headers: { "User-Agent": UA, Accept: "image/*", Referer: "https://www.cam4.com/" },
        signal: AbortSignal.timeout(15000)
      });
      if (!r.ok) return res.status(502).send("Imagem indisponível");
      const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const image = Buffer.from(await r.arrayBuffer());
      if (type !== "image/jpeg" || image.length < 3 || image[0] !== 255 || image[1] !== 216 || image[2] !== 255) {
        return res.status(502).send("Imagem inválida");
      }
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.send(image);
    } catch (e) { console.error("[CAM4 imagem]", e.message); if (!res.headersSent) res.sendStatus(502); }
  });
  return { catalog, meta, stream, router };
};


function createStripchat(PUBLIC_URL) {
  const handlers = {};
  const builder = {
    defineCatalogHandler(fn) { handlers.catalog = fn; },
    defineMetaHandler(fn) { handlers.meta = fn; },
    defineStreamHandler(fn) { handlers.stream = fn; }
  };
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PREFIX = "stripchat:";
const CACHE_MS = 60000;
const PAGE_SIZE = 80;
const MAX_PAGES = 8;

// v1.3.3 style: prefere URL direta da API; proxy só como fallback
function thumb(usuario, previewUrl) {
  if (
    previewUrl &&
    (previewUrl.startsWith("http://") || previewUrl.startsWith("https://"))
  ) {
    return previewUrl;
  }
  if (previewUrl && previewUrl.startsWith("/")) {
    return "https://static-proxy.strpst.com" + previewUrl;
  }
  return (
    PUBLIC_URL +
    "/stripchat/imagem/" +
    encodeURIComponent(usuario) +
    ".jpg"
  );
}

async function getJson(url) {
  const resposta = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: "https://br.stripchat.com/men/brazilian",
      Origin: "https://stripchat.com"
    },
    signal: AbortSignal.timeout(25000)
  });

  if (!resposta.ok) {
    throw new Error("HTTP " + resposta.status + " em " + url);
  }

  return resposta.json();
}

let cache = {
  t: 0,
  data: []
};

// Lista masculina original, com o filtro Brasil aplicado permanentemente.
async function listarOnline() {
  if (Date.now() - cache.t < CACHE_MS && cache.data.length) return cache.data;
  const vistos = new Map();
  for (let pagina = 0; pagina < MAX_PAGES; pagina++) {
    const params = new URLSearchParams({
      removeShows: "false", recInFeatured: "false", limit: String(PAGE_SIZE),
      offset: String(pagina * PAGE_SIZE), sortBy: "stripRanking",
      primaryTag: "men", nic: "true"
    });
    const data = await getJson("https://stripchat.com/api/front/models?" + params);
    const models = Array.isArray(data?.models) ? data.models : [];
    for (const m of models) {
      const username = String(m.username || "").trim();
      const country = String(m.country || m.countryCode || "").toLowerCase();
      const status = String(m.status || "").toLowerCase();
      if (!username || country !== "br" || vistos.has(username)) continue;
      if (!["public", "groupshow", "group"].includes(status)) continue;
      vistos.set(username, {
        username, id: m.id || m.streamName,
        streamName: m.streamName || (m.id ? String(m.id) : null),
        country, status, viewers: Number(m.viewersCount) || 0,
        isHd: !!m.isHd, isMobile: !!m.isMobile, isVr: !!m.isVr,
        preview: m.previewUrlThumbBig || m.previewUrlThumbSmall || m.previewUrl || m.avatarUrl || "",
        title: m.groupShowTopic || ""
      });
    }
    if (models.length < PAGE_SIZE) break;
  }
  const lista = [...vistos.values()].sort((a,b) => b.viewers - a.viewers);
  cache = {t: Date.now(), data: lista};
  console.log("[Stripchat]", lista.length, "câmeras do Brasil");
  return lista;
}

builder.defineCatalogHandler(async function ({ extra }) {
  try {
    let usuarios = await listarOnline();

    // Busca por nome
    if (extra?.search) {
      const busca = String(extra.search).toLowerCase().trim();
      usuarios = usuarios.filter((u) =>
        u.username.toLowerCase().includes(busca)
      );
    }

    const skipInformado = parseInt(extra?.skip || "0", 10);
    const skip =
      Number.isFinite(skipInformado) && skipInformado >= 0
        ? skipInformado
        : 0;

    const metas = usuarios.slice(skip, skip + 100).map(function (u) {
      const descParts = [];
      if (u.viewers > 0) descParts.push(u.viewers + " espectadores");
      if (u.country) descParts.push(u.country.toUpperCase());
      if (u.isHd) descParts.push("HD");
      if (u.isMobile) descParts.push("Mobile");
      if (u.isVr) descParts.push("VR");
      if (u.title) descParts.push(u.title);

      const img = thumb(u.username, u.preview);
      return {
        id: PREFIX + u.username,
        type: "tv",
        name: u.username,
        poster: img,
        background: img,
        posterShape: "landscape",
        description: descParts.join(" · ")
      };
    });

    return { metas };
  } catch (erro) {
    console.error("[catalogo]", erro.message);
    return { metas: [] };
  }
});

// Meta: poster = preview do modelo; background = logo Stripchat Guys (fixo)
builder.defineMetaHandler(async function ({ id }) {
  if (typeof id !== "string" || !id.startsWith(PREFIX)) {
    return { meta: null };
  }

  const usuario = id.slice(PREFIX.length);

  const encontrar = (lista) =>
    lista.find(
      (modelo) =>
        modelo.username.toLowerCase() === usuario.toLowerCase()
    );

  // Prioriza a mesma imagem já usada no catálogo.
  let modelo = encontrar(cache.data);

  // Pode ocorrer ao abrir um favorito após reiniciar o servidor.
  if (!modelo?.preview) {
    try {
      const lista = await listarOnline();
      modelo = encontrar(lista) || modelo;
    } catch (erro) {
      console.error(
        "[Stripchat meta] Falha ao atualizar catálogo:",
        erro.message
      );
    }
  }

  let imageUrl = thumb(usuario, modelo?.preview);

  // Só consulta os detalhes da câmera se não houver preview no catálogo.
  if (!modelo?.preview) {
    try {
      const userData = await getJson(
        "https://stripchat.com/api/front/users/user-ids/" +
          encodeURIComponent(usuario)
      );

      if (userData?.id) {
        const camData = await getJson(
          "https://stripchat.com/api/front/v2/models/" +
            userData.id +
            "/cam"
        );

        const user =
          camData?.user?.user ||
          camData?.user ||
          {};

        const preview =
          user.previewUrlThumbBig ||
          user.previewUrlThumbSmall ||
          user.previewUrl ||
          user.avatarUrl ||
          user.avatarUrlOriginal;

        if (preview) {
          imageUrl = thumb(usuario, preview);
        }
      }
    } catch (erro) {
      console.error(
        "[Stripchat meta] Falha ao buscar preview:",
        erro.message
      );
    }
  }

  console.log("[Stripchat meta]", usuario, "imagem:", imageUrl);

  return {
    meta: {
      id,
      type: "tv",
      name: usuario,
      poster: imageUrl,
      background: imageUrl,
      posterShape: "landscape",
      description: modelo
        ? `${modelo.viewers || 0} espectadores · Brasil`
        : "Transmissão ao vivo · Brasil",
      behaviorHints: {
        isLive: true
      }
    },
    cacheMaxAge: 0
  };
});

// Resolve streamName a partir do username
async function resolveStreamName(usuario) {
  let modelId = null;
  let streamName = null;

  try {
    const userData = await getJson(
      "https://stripchat.com/api/front/users/user-ids/" +
        encodeURIComponent(usuario)
    );
    if (userData && userData.id) modelId = userData.id;
  } catch (e) {}

  let camData = null;
  if (modelId) {
    try {
      camData = await getJson(
        "https://stripchat.com/api/front/v2/models/" + modelId + "/cam"
      );
    } catch (e) {}
  }

  if (!camData) {
    try {
      camData = await getJson(
        "https://stripchat.com/api/front/v2/models/username/" +
          encodeURIComponent(usuario) +
          "/cam"
      );
    } catch (e) {}
  }

  if (camData) {
    streamName =
      camData.streamName ||
      (camData.cam && camData.cam.streamName) ||
      (camData.user && camData.user.streamName) ||
      modelId;
  }

  if (!streamName && modelId) streamName = String(modelId);
  if (!streamName) {
    const known = cache.data.find(m => m.username.toLowerCase() === usuario.toLowerCase());
    streamName = known?.streamName || known?.id;
  }
  if (!streamName) throw new Error("Stream não resolvido: " + usuario);

  return String(streamName);
}

builder.defineStreamHandler(async function ({ id }) {
  if (typeof id !== "string" || !id.startsWith(PREFIX)) {
    return { streams: [] };
  }

  const usuario = id.slice(PREFIX.length);

  try {
    // Aponta para o nosso proxy de playlist (mais estável que URL direta)
    const proxyUrl = PUBLIC_URL + "/stripchat/proxy/" + encodeURIComponent(usuario) + "/master.m3u8";

    return {
      streams: [
        {
          name: "Stripchat",
          title: "Ao vivo • HLS (proxy)",
          url: proxyUrl,
          behaviorHints: {
            notWebReady: false, // tenta player interno primeiro
            bingeGroup: "stripchat-live"
          }
        }
      ]
    };
  } catch (erro) {
    console.error("[stream]", usuario, erro.message);
    return { streams: [] };
  }
});

const app = express.Router();

// ========== PROXY HLS COM DECRYPT MOUFLON ==========

const crypto = { createHash };

// Chaves pkey → pdkey (atualizadas da comunidade kesamom/stripchat_mouflon)
// Serão atualizadas automaticamente se possível
let MOUFLON_KEYS = {
  Zokee2OhPh9kugh4: "Quean4cai9boJa5a",
  Zeechoej4aleeshi: "ubahjae7goPoodi6",
  Ook7quaiNgiyuhai: "EQueeGh2kaewa3ch",
  Fq6m2TO2ZeBkRPm9: "xb6di1NF9EFXHUwb",
  GrRncsoByZmsiT6L: "NigHYyOD9l4rvAEb",
  "1Dzcc6OjP73LKbtI": "Y64UVwX5RrIWnOLp",
  N2oLovTIXb0o28Uj: "ABE7Sj8jh3oPM2ae",
  NTK9aqcLmNFMWrpQ: "tOcYOap4Ty1l9Jzb",
  "7uUnbD0jMCB9GH32": "lzCQ6QBTnLpB0zMF",
  Ohi7eTRBpkAuML0l: "kExe29N2sLFrHGqu",
  OLzu7QlySkG2fVRn: "CsovScFH9VirSJ4Z"
};

let keysLastFetch = 0;

async function refreshMouflonKeys() {
  if (Date.now() - keysLastFetch < 30 * 60 * 1000) return; // 30 min
  try {
    const r = await fetch(
      "https://raw.githubusercontent.com/kesamom/stripchat_mouflon/main/stripchat_mouflon_keys.json",
      { signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const data = await r.json();
      if (data && typeof data === "object") {
        MOUFLON_KEYS = { ...MOUFLON_KEYS, ...data };
        keysLastFetch = Date.now();
        console.log("[mouflon] keys refreshed, total:", Object.keys(MOUFLON_KEYS).length);
      }
    }
  } catch (e) {
    // mantém as chaves embutidas
  }
}

// Decripta token MOUFLON v2
function mouflonDecode(encryptedB64, pdkey) {
  const hash = crypto.createHash("sha256").update(pdkey, "utf8").digest();
  let b64 = encryptedB64;
  while (b64.length % 4 !== 0) b64 += "=";
  let data;
  try {
    data = Buffer.from(b64, "base64");
  } catch (e) {
    return null;
  }
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ hash[i % hash.length];
  }
  try {
    return out.toString("utf8");
  } catch (e) {
    return null;
  }
}

// Extrai pkey/pdkey de um master m3u8
function extractMouflon(masterText) {
  const lines = masterText.split("\n");
  for (const line of lines) {
    if (line.includes("#EXT-X-MOUFLON:PSCH:v2:")) {
      const parts = line.trim().split(":");
      // #EXT-X-MOUFLON:PSCH:v2:PKEY
      if (parts.length >= 4) {
        const pkey = parts[3].trim();
        const pdkey = MOUFLON_KEYS[pkey];
        if (pdkey) {
          return { psch: "v2", pkey, pdkey };
        }
      }
    }
  }
  // tenta qualquer pkey conhecido que apareça
  for (const line of lines) {
    for (const pkey of Object.keys(MOUFLON_KEYS)) {
      if (line.includes(pkey)) {
        return { psch: "v2", pkey, pdkey: MOUFLON_KEYS[pkey] };
      }
    }
  }
  return null;
}

// Decripta uma media playlist (substitui tokens criptografados)
function decryptMediaPlaylist(body, pdkey) {
  const lines = body.split("\n");
  const out = [];
  let lastDecoded = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("#EXT-X-MOUFLON:URI:")) {
      // Formato: #EXT-X-MOUFLON:URI:https://.../xxx_ENCODED_yyy.mp4
      const uri = trimmed.slice("#EXT-X-MOUFLON:URI:".length);
      try {
        const parts = uri.split("_");
        if (parts.length >= 2) {
          const encodedPart = parts[parts.length - 2];
          const reversed = encodedPart.split("").reverse().join("");
          const decodedPart = mouflonDecode(reversed, pdkey);
          if (decodedPart) {
            const newUri = uri.replace(encodedPart, decodedPart);
            // Pega só o path relativo final (como o StreaMonitor faz)
            const pathParts = newUri.split("/");
            lastDecoded = pathParts.slice(4).join("/") || newUri;
            // Não emite a linha MOUFLON, só guarda o resultado
            continue;
          }
        }
      } catch (e) {}
      // se falhar, ignora a linha MOUFLON
      continue;
    }

    // Linha de segmento que normalmente é um placeholder
    if (lastDecoded && !trimmed.startsWith("#") && trimmed.length > 0) {
      // Substitui o placeholder pelo path decriptado
      // Muitos casos o segmento vem como nome fixo; usamos o lastDecoded
      if (trimmed.includes("media") || trimmed.endsWith(".mp4") || trimmed.endsWith(".ts") || !trimmed.startsWith("http")) {
        out.push(lastDecoded.startsWith("http") ? lastDecoded : trimmed.replace(/[^/]+$/, lastDecoded.split("/").pop()));
        // Melhor: se lastDecoded for path completo relativo ao host
        // Vamos preferir construir URL absoluta se possível
        lastDecoded = null;
        continue;
      }
    }

    out.push(line);
  }

  return out.join("\n");
}

// Versão mais robusta de decrypt (baseada no StreaMonitor)
// Substitui o placeholder media.mp4 pela URL completa decriptada
function decryptMediaPlaylistV2(body, pdkey) {
  const lines = body.split("\n");
  const out = [];
  let pendingUrl = null;
  const MOUFLON_URI = "#EXT-X-MOUFLON:URI:";

  for (const line of lines) {
    const trimmed = line.trim();

    // Token criptografado
    if (trimmed.startsWith(MOUFLON_URI)) {
      const uri = trimmed.slice(MOUFLON_URI.length);
      try {
        const parts = uri.split("_");
        if (parts.length >= 2) {
          const encodedPart = parts[parts.length - 2];
          const reversed = encodedPart.split("").reverse().join("");
          const decodedPart = mouflonDecode(reversed, pdkey);
          if (decodedPart && decodedPart.length > 2) {
            pendingUrl = uri.replace(encodedPart, decodedPart);
          }
        }
      } catch (e) {
        pendingUrl = null;
      }
      continue; // nunca emite a tag MOUFLON
    }

    // Linha de segmento (placeholder media.mp4) → troca pela URL real
    if (pendingUrl && trimmed && !trimmed.startsWith("#")) {
      out.push(pendingUrl);
      pendingUrl = null;
      continue;
    }

    // Remove tags MOUFLON residuais
    if (trimmed.includes("MOUFLON")) continue;

    out.push(line);
  }

  return out.join("\n");
}

const CDN_HEADERS = {
  "User-Agent": UA,
  Referer: "https://br.stripchat.com/men/brazilian",
  Origin: "https://stripchat.com",
  Accept: "*/*"
};

// Master playlist → reescreve media playlists para nosso proxy + tenta anexar psch/pkey
app.get("/proxy/:usuario/master.m3u8", async function (req, res) {
  try {
    await refreshMouflonKeys();

    const usuario = String(req.params.usuario || "").trim();
    if (!usuario || usuario.length > 80) {
      return res.status(400).send("invalid");
    }

    const streamName = await resolveStreamName(usuario);

    const masterCandidates = [
      `https://edge-hls.doppiocdn.com/hls/${streamName}/master/${streamName}_auto.m3u8`,
      `https://edge-hls.doppiocdn.org/hls/${streamName}/master/${streamName}_auto.m3u8`,
      `https://media-hls.doppiocdn.com/b-hls-12/${streamName}/master/${streamName}_auto.m3u8`
    ];

    let masterText = null;
    let masterUrl = null;

    for (const url of masterCandidates) {
      try {
        const r = await fetch(url, {
          headers: CDN_HEADERS,
          signal: AbortSignal.timeout(12000)
        });
        if (r.ok) {
          masterText = await r.text();
          masterUrl = r.url || url;
          break;
        }
      } catch (e) {}
    }

    if (!masterText) {
      return res.status(502).send("master unavailable");
    }

    const mouflon = extractMouflon(masterText);

    // Reescreve as media playlists para passarem pelo nosso proxy decriptador
    const lines = masterText.split("\n");
    const out = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("#") || trimmed === "") {
        // Remove as tags MOUFLON do master (já vamos tratar no media)
        if (trimmed.includes("MOUFLON")) continue;
        out.push(line);
        continue;
      }

      if (trimmed) {
        let mediaUrl = new URL(trimmed, masterUrl).href;
        // Alguns players se beneficiam de receber psch/pkey na query
        if (mouflon) {
          const sep = mediaUrl.includes("?") ? "&" : "?";
          mediaUrl = mediaUrl + sep + "psch=" + mouflon.psch + "&pkey=" + encodeURIComponent(mouflon.pkey);
        }

        const proxied =
          PUBLIC_URL +
          "/stripchat/proxy/" +
          encodeURIComponent(usuario) +
          "/media?u=" +
          encodeURIComponent(mediaUrl) +
          (mouflon ? "&pk=" + encodeURIComponent(mouflon.pkey) : "");
        out.push(proxied);
      } else {
        out.push(line);
      }
    }

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.send(out.join("\n"));
  } catch (err) {
    console.error("[proxy master]", err.message);
    res.status(502).send("proxy error");
  }
});

// Media playlist com decrypt MOUFLON
app.get("/proxy/:usuario/media", async function (req, res) {
  try {
    await refreshMouflonKeys();
    const target = req.query.u;
    const pkey = req.query.pk || null;

    if (!target || typeof target !== "string" || !target.startsWith("http")) {
      return res.status(400).send("missing url");
    }

    let upstream;
    try { upstream = new URL(target); } catch { return res.status(400).send("invalid url"); }
    const allowed = ["doppiocdn.com", "doppiocdn.org", "strpst.com"];
    if (upstream.protocol !== "https:" || upstream.username || upstream.password ||
        (upstream.port && upstream.port !== "443") ||
        !allowed.some(host => upstream.hostname === host || upstream.hostname.endsWith("." + host))) {
      return res.status(403).send("forbidden");
    }

    const r = await fetch(target, {
      headers: CDN_HEADERS,
      redirect: "manual",
      signal: AbortSignal.timeout(15000)
    });

    if (!r.ok) {
      return res.status(502).send("upstream " + r.status);
    }

    let body = await r.text();
    const baseUrl = target.substring(0, target.lastIndexOf("/") + 1);

    // Tenta encontrar pdkey
    let pdkey = null;
    if (pkey && MOUFLON_KEYS[pkey]) {
      pdkey = MOUFLON_KEYS[pkey];
    } else {
      // tenta extrair do próprio body
      const m = extractMouflon(body);
      if (m) pdkey = m.pdkey;
    }

    if (pdkey && body.includes("MOUFLON")) {
      body = decryptMediaPlaylistV2(body, pdkey);
    } else {
      // fallback: só absolutiza segmentos
      const lines = body.split("\n");
      const out = [];
      for (const line of lines) {
        const t = line.trim();
        if (t && !t.startsWith("#") && !t.startsWith("http")) {
          out.push(new URL(t, target).href);
        } else if (!t.includes("MOUFLON")) {
          out.push(line);
        }
      }
      body = out.join("\n");
    }

    body = body.split("\n").map(line => {
      const t = line.trim();
      if (t && !t.startsWith("#")) return new URL(t, target).href;
      return line.replace(/URI="([^"\r\n]+)"/g, (_, value) => 'URI="' + new URL(value, target).href + '"');
    }).join("\n");
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.send(body);
  } catch (err) {
    console.error("[proxy media]", err.message);
    res.status(502).send("proxy error");
  }
});

// Proxy de thumbnail – tenta várias fontes reais do Stripchat
// Proxy de imagem no estilo do brazilcam4-nuvio
app.get("/imagem/:usuario.jpg", async function (req, res) {
  try {
    const usuario = String(req.params.usuario || "").trim();

    if (
      usuario === "" ||
      usuario.length > 100 ||
      usuario.includes("/") ||
      usuario.includes("..")
    ) {
      return res.status(400).send("Nome inválido");
    }

    let imageUrl = null;

    // 1. Busca preview real pela API (estrutura camData.user.user.*)
    try {
      const userData = await getJson(
        "https://stripchat.com/api/front/users/user-ids/" +
          encodeURIComponent(usuario)
      );

      if (userData && userData.id) {
        const camData = await getJson(
          "https://stripchat.com/api/front/v2/models/" + userData.id + "/cam"
        );

        const u =
          (camData && camData.user && camData.user.user) ||
          (camData && camData.user) ||
          {};

        imageUrl =
          u.previewUrl ||
          u.previewUrlThumbBig ||
          u.previewUrlThumbSmall ||
          u.avatarUrl ||
          u.avatarUrlOriginal ||
          null;
      }
    } catch (e) {
      // continua
    }

    if (imageUrl && imageUrl.startsWith("/")) {
      imageUrl = "https://static-proxy.strpst.com" + imageUrl;
    }

    const candidates = [
      imageUrl,
      "https://static-proxy.strpst.com/previews/" + encodeURIComponent(usuario) + "/thumb_big",
      "https://static-proxy.strpst.com/avatars/" + encodeURIComponent(usuario)
    ].filter(Boolean);

    for (const url of candidates) {
      try {
        const imgRes = await fetch(url, {
          headers: {
            "User-Agent": UA,
            Referer: "https://br.stripchat.com/men/brazilian",
            Accept: "image/*"
          },
          signal: AbortSignal.timeout(12000)
        });

        if (!imgRes.ok) continue;

        const tipo = (imgRes.headers.get("content-type") || "")
          .split(";")[0]
          .trim()
          .toLowerCase();

        if (!tipo.startsWith("image/")) continue;

        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (buf.length < 500) continue;

        res.setHeader("Content-Type", tipo);
        res.setHeader("Cache-Control", "public, max-age=120");
        return res.send(buf);
      } catch (e) {
        // tenta próximo
      }
    }

    // Placeholder cinza 1x1
    const placeholder = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=30");
    res.send(placeholder);
  } catch (erro) {
    console.error("[imagem]", erro.message);
    if (!res.headersSent) {
      res.status(502).send("Falha ao carregar imagem");
    }
  }
});


return { ...handlers, router: app };
};

const LOGO_B64="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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//Z";

let providers=null,activeOrigin=null;
function manifest(origin){return {
id:'community.gtv',version:'1.0.1',name:'G-TV',description:'CAM4 e Stripchat · Câmeras masculinas do Brasil · Conteúdo adulto 18+',logo:origin+'/logo.jpeg',resources:['catalog','meta','stream'],types:['tv'],idPrefixes:['cam4:','stripchat:'],catalogs:[{type:'tv',id:'cam4br',name:'CAM4 Brasil',extra:[{name:'search'},{name:'skip'}]},{type:'tv',id:'stripchatbr',name:'Stripchat Brasil',extra:[{name:'search'},{name:'skip'}]}],behaviorHints:{adult:true}};}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function route(request,env){
 const url=new URL(request.url);
 if(request.method==='OPTIONS')return new Response(null,{status:204});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const origin=(env.PUBLIC_URL||url.origin).replace(/\/+$/,'');const parsed=new URL(origin);
 if(!['http:','https:'].includes(parsed.protocol)||parsed.search||parsed.hash||parsed.username||parsed.password||parsed.pathname!=='/')throw Error('PUBLIC_URL inválida');
 if(!providers||activeOrigin!==origin){providers={cam4:createCam4(origin),stripchat:createStripchat(origin)};activeOrigin=origin;}
 if(url.pathname==='/health')return json({ok:true,addon:'G-TV',runtime:'workers'});
 if(url.pathname==='/manifest.json')return json(manifest(origin));
 if(['/logo.png','/logo.jpeg','/logo.jpg'].includes(url.pathname))return new Response(Buffer.from(LOGO_B64,'base64'),{headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400'}});
 if(url.pathname==='/')return new Response('G-TV 18+ — instale '+origin+'/manifest.json');
 for(const name of ['cam4','stripchat'])if(url.pathname.startsWith('/'+name+'/'))return await providers[name].router.handle(url.pathname.slice(name.length+1),url)||new Response('Not found',{status:404});
 const match=url.pathname.match(/^\/(catalog|meta|stream)\/([^/]+)\/([^/]+?)(?:\/([^/]+))?\.json$/);
 if(!match)return new Response('Not found',{status:404});
 const [,resource,type,encodedId,encodedExtra]=match;const id=decodeURIComponent(encodedId),extra={};
 if(encodedExtra)for(const pair of encodedExtra.split('&')){const eq=pair.indexOf('=');if(eq>=0)extra[decodeURIComponent(pair.slice(0,eq))]=decodeURIComponent(pair.slice(eq+1));}
 for(const [k,v]of url.searchParams)extra[k]=v;
 const empty=resource==='catalog'?{metas:[]}:resource==='meta'?{meta:null}:{streams:[]};
 if(type!=='tv')return json(empty);
 const provider=resource==='catalog'?(id==='cam4br'?providers.cam4:id==='stripchatbr'?providers.stripchat:null):providers[id.split(':')[0]];
 return json(provider?await provider[resource]({type,id,extra}):empty);
}
export default{async fetch(request,env={}){let r;try{r=await route(request,env);}catch(e){console.error('[worker]',e);r=json({error:'Falha ao processar a solicitação'},500);}const h=new Headers(r.headers);h.set('Access-Control-Allow-Origin','*');h.set('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');h.set('Access-Control-Allow-Headers','*');h.set('X-Content-Type-Options','nosniff');return new Response(request.method==='HEAD'?null:r.body,{status:r.status,headers:h});}};
