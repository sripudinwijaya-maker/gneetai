// Logika bersama untuk Vercel (folder /api) dan server lokal (server.js).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API_ROOT = "https://api.emix.ai/api/v1";
const API = API_ROOT + "/client/tasks";
const MODEL = "suno/upload-and-cover-audio";
const SUNO_MODELS = {
  generate: "suno/generate",
  cover: "suno/upload-and-cover-audio",
  extend: "suno/upload-and-extend-audio",
  extendExisting: "suno/extend",
  addVocals: "suno/add-vocals",
  addInstrumental: "suno/add-instrumental",
  replaceSection: "suno/replace-section",
  boostStyle: "suno/boost-music-style",
  musicCover: "suno/cover-generate",
  persona: "suno/generate-persona",
  mashup: "suno/mashup",
  timestampedLyrics: "suno/timestamped-lyrics",
  separateVocals: "suno/separate-vocals",
  midi: "suno/generate-midi-from-audio",
};
const ALLOWED = [
  "uploadUrl", "title", "style", "duration", "instrumental", "lyrics", "prompt", "model",
  "negativeTags", "vocalGender", "styleWeight", "weirdnessConstraint",
  "audioWeight", "variety", "personaId", "personaModel", "continueAt",
  "customMode", "audioId", "audioIds", "startTime", "endTime", "negativeTags", "callBackUrl",
  "voiceId", "stylePrompt", "taskId", "uploadUrl", "audioUrl", "audioUrls", "audioId", "audioIds", "personaId", "personaModel", "startTime", "endTime", "callBackUrl",
];

// Indeks key default yang saldonya habis atau tidak valid (diingat selama instance hidup)
const dead = new Set();

// Akun sederhana: USERNAME_PW, USERNAME_KEY_1, USERNAME_KEY_2, ...
// Juga mendukung USERNAME_APIKEY_1 / USERNAME_APIKEY_2 dan USERNAME_APIKEY.
// Setiap akun hanya boleh memakai key dengan prefix username-nya sendiri.
function normalizeUsername(value) {
  return String(value || "").trim().toUpperCase();
}
function findConfiguredUser(username) {
  const wanted = normalizeUsername(username);
  if (!/^[A-Z0-9][A-Z0-9_]{2,39}$/.test(wanted)) return null;
  const password = String(process.env[wanted + "_PW"] || process.env[wanted + "_PASSWORD"] || "");
  const keys = [];
  for (let i = 1; i <= 100; i++) {
    const key = String(process.env[wanted + "_KEY_" + i] || process.env[wanted + "_APIKEY_" + i] || "").trim();
    if (key) keys.push({ key, index: i });
  }
  // Optional single-key shorthand.
  if (!keys.length) {
    const key = String(process.env[wanted + "_APIKEY"] || process.env[wanted + "_KEY"] || "").trim();
    if (key) keys.push({ key, index: 1 });
  }
  if (!password || !keys.length) return null;
  return { username: wanted, password, name: wanted, keys };
}
function getUser(req) {
  const header = String((req.headers || {}).authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !process.env.SESSION_SECRET) return null;
  const parts = match[1].split(".");
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(parts[0]).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(parts[1]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!data.u || !data.exp || data.exp < Date.now()) return null;
    return data.u;
  } catch (_) { return null; }
}
function makeToken(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 12 * 60 * 60 * 1000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("hex");
  return payload + "." + sig;
}
function userKeys(username) {
  const account = findConfiguredUser(username);
  return account ? account.keys : [];
}
function userKey(username) {
  const keys = userKeys(username);
  return keys.length ? keys[0].key : "";
}
function isKeyUnavailable(json) {
  const msg = String((json && (json.msg || json.message || json.error)) || "").toLowerCase();
  return json && (json.code === 401 || json.code === 402 || /insufficient credit|credit (is )?(exhausted|not enough)|quota exceeded|no balance|out of balance|saldo (habis|tidak cukup)|kredit (habis|tidak cukup)|limit exceeded/.test(msg));
}
async function handleLogin(req, res) {
  if (req.method !== "POST") return send(res, 405, { code: 405, msg: "Gunakan POST" });
  if (!process.env.SESSION_SECRET) return send(res, 500, { code: 500, msg: "SESSION_SECRET belum diatur di Environment Variables." });
  let body;
  try { body = await readJson(req); } catch (_) { return send(res, 400, { code: 400, msg: "Data login tidak valid." }); }
  const username = normalizeUsername(body.username);
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[A-Z0-9][A-Z0-9_]{2,39}$/.test(username)) return send(res, 401, { code: 401, msg: "Username atau password salah." });
  const account = findConfiguredUser(username);
  if (!account || !account.password || !account.keys.length || password.length === 0) return send(res, 401, { code: 401, msg: "Akun belum didaftarkan atau username/password salah." });
  const a = Buffer.from(account.password), b = Buffer.from(password);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(res, 401, { code: 401, msg: "Username atau password salah." });
  return send(res, 200, { code: 200, token: makeToken(username), username, name: account.name });
}
function requireUser(req, res) {
  const username = getUser(req);
  if (!username) { send(res, 401, { code: 401, msg: "Sesi login berakhir. Silakan login lagi." }); return null; }
  if (!userKeys(username).length) { send(res, 403, { code: 403, msg: "API key untuk akun ini belum dikonfigurasi." }); return null; }
  return username;
}


function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  }
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 100000) throw new Error("Body terlalu besar");
  }
  return JSON.parse(data || "{}");
}

// Daftar key default: env EMIX_API_KEYS (dipisah baris, koma, atau spasi), atau file keys.txt
function getKeys() {
  let raw = process.env.EMIX_API_KEYS || process.env.EMIX_API_KEY || "";
  if (!raw.trim()) {
    const candidates = [path.join(__dirname, "..", "keys.txt"), path.join(process.cwd(), "keys.txt")];
    for (const f of candidates) {
      try { raw = fs.readFileSync(f, "utf8"); if (raw.trim()) break; } catch (e) { raw = ""; }
    }
  }
  const keys = raw
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("#"))
    .join(",")
    .split(/[\s,]+/)
    .filter(Boolean);
  return Array.from(new Set(keys));
}

function validKeyFormat(k) {
  return typeof k === "string" && /^[\w.\-]{8,200}$/.test(k);
}

async function call(key, url, options) {
  const r = await fetch(url, {
    ...options,
    headers: {
      ...(options && options.headers ? options.headers : {}),
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { msg: text.slice(0, 500) || "Respons tidak valid dari Emix" };
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    json = { msg: "Format respons tidak dikenali dari Emix" };
  }
  // Beberapa gateway mengirim HTTP 200 tetapi code error di JSON, dan sebaliknya.
  const bodyCode = Number(json.code);
  const code = (r.status === 401 || r.status === 402)
    ? r.status
    : (Number.isFinite(bodyCode) && bodyCode > 0 ? bodyCode : r.status);
  return {
    ...json,
    code,
    upstreamStatus: r.status,
    source: "emix",
    // Keep a compact provider diagnostic so the UI can show the actual missing-field message.
    providerMessage: String(json.msg || json.message || json.error || "").slice(0, 600),
  };
}

// Mengembalikan pesan error bila akses ditolak, atau null bila boleh lanjut
function checkAccess(req, usingOwnKey) {
  const need = process.env.ACCESS_CODE;
  if (!need || usingOwnKey) return null;
  return req.headers["x-access-code"] === need ? null : "Kode akses salah atau belum diisi.";
}

function ownKeyFrom(req) {
  const username = getUser(req);
  return username ? userKey(username) : "";
}

async function handleInfo(req, res) {
  const username = requireUser(req, res);
  if (!username) return;
  const account = findConfiguredUser(username);
  send(res, 200, { code: 200, username, name: account ? account.name : username });
}

async function handleCreate(req, res) {
  if (req.method !== "POST") return send(res, 405, { code: 405, msg: "Gunakan POST" });
  if (!requireUser(req, res)) return;
  let body;
  try { body = await readJson(req); } catch (e) { return send(res, 400, { code: 400, msg: "Body bukan JSON yang valid" }); }

  if (body.workflow === "kling" || (body.input && body.input.workflow === "kling")) return handleKlingCreate(req, res, body);

  const workflow = body.workflow || "cover";
  if (!Object.prototype.hasOwnProperty.call(SUNO_MODELS, workflow)) return send(res, 422, { code: 422, msg: "Fitur Suno tidak dikenal atau belum dipetakan." });
  const username = getUser(req);
  const ownKeys = userKeys(username);
  if (ownKeys.some((item) => !validKeyFormat(item.key))) return send(res, 422, { code: 422, msg: "Format salah satu API key akun tidak valid. Periksa Environment Variables." });
  const denied = checkAccess(req, true);
  if (denied) return send(res, 401, { code: 401, msg: denied });

  const input = {};
  for (const k of ALLOWED) {
    let v = body.input && body.input[k];
    // UI versi lama mengirim Lyrics dengan huruf besar; API terbaru memakai lyrics.
    if (k === "lyrics" && (v === undefined || v === null || v === "") && body.input) v = body.input.Lyrics;
    if (v !== undefined && v !== null && v !== "") input[k] = v;
  }
  const urlWorkflows = ["cover", "extend", "addVocals", "addInstrumental", "replaceSection", "boostStyle", "musicCover", "persona", "mashup", "timestampedLyrics", "separateVocals", "midi"];
  const sourceUrl = input.uploadUrl || input.audioUrl || (Array.isArray(input.audioUrls) ? input.audioUrls[0] : "");
  const hasPublicUrl = /^https?:\/\//i.test(sourceUrl || "");
  const hasAudioId = typeof input.audioId === "string" && !!input.audioId.trim();
  const hasAudioIds = Array.isArray(input.audioIds) && input.audioIds.length > 0;
  if (urlWorkflows.includes(workflow) && !hasPublicUrl && !hasAudioId && !hasAudioIds) {
    return send(res, 422, { code: 422, msg: "Fitur ini memerlukan URL audio publik, audioId, atau audioIds sesuai dokumentasi endpoint." });
  }
  if (workflow === "extendExisting" && !hasAudioId) {
    return send(res, 422, { code: 422, msg: "Extend Existing memerlukan audioId dari track Suno. Gunakan Upload and Extend jika sumbernya berupa file/URL audio." });
  }
  if (workflow === "extend" && (!Number.isFinite(Number(input.continueAt)) || Number(input.continueAt) < 0)) return send(res, 422, { code: 422, msg: "Posisi extend harus berupa detik yang valid." });
  // Keep the selected Suno model for endpoints that require it. The UI sends it,
  // so it must be included in ALLOWED and must not be silently discarded.
  input.model = String(input.model || "V6").toUpperCase();
  if (!["V6", "V6_MINI", "V6_WILD"].includes(input.model)) input.model = "V6";
  // Remove only UI-only fields; model is a real API parameter.
  delete input.workflow;
  if (workflow === "generate") delete input.uploadUrl;
  if (workflow === "generate") {
    // Emix Generate Music requires customMode, instrumental, and model.
    input.customMode = input.customMode === true || input.customMode === "true";
    input.instrumental = input.instrumental === true || input.instrumental === "true";
    if (!input.customMode) {
      // Non-custom mode accepts prompt plus optional attachments/style/lyrics.
      delete input.title; delete input.negativeTags; delete input.duration;
      delete input.vocalGender; delete input.styleWeight; delete input.weirdnessConstraint;
      delete input.audioWeight; delete input.variety;
      if (!input.prompt && !input.style && !input.lyrics && !input.audioUrls && !input.imageUrls && !input.videoUrls) {
        return send(res, 422, { code: 422, msg: "Isi prompt, gaya musik, lirik, atau URL media untuk Generate Music." });
      }
    } else {
      if (!input.style && !input.lyrics && !input.prompt && !input.negativeTags) {
        return send(res, 422, { code: 422, msg: "Custom Mode membutuhkan minimal gaya musik, lirik, atau negative tags." });
      }
      if (input.title && input.title.length > 80) return send(res, 422, { code: 422, msg: "Judul maksimal 80 karakter." });
      if (input.style && input.style.length > 1000) return send(res, 422, { code: 422, msg: "Gaya musik maksimal 1000 karakter." });
      if (input.lyrics && input.lyrics.length > 5000) return send(res, 422, { code: 422, msg: "Lirik maksimal 5000 karakter." });
      if (input.negativeTags && input.negativeTags.length > 1000) return send(res, 422, { code: 422, msg: "Negative tags maksimal 1000 karakter." });
      input.variety = Number.isFinite(Number(input.variety)) ? Math.max(0, Math.min(4, Math.round(Number(input.variety)))) : 1;
      for (const k of ["styleWeight", "weirdnessConstraint", "audioWeight"]) {
        if (input[k] !== undefined) input[k] = Math.max(0, Math.min(1, Number(input[k])));
      }
    }
  }
  const apiModel = SUNO_MODELS[workflow];
  const payload = { method: "POST", body: JSON.stringify({ model: apiModel, input }) };

  try {
    // Coba hanya key milik username yang sedang login. Jangan pernah fallback ke key global/user lain.
    let lastOwnFailure = null;
    for (const item of ownKeys) {
      const json = await call(item.key, API, payload);
      if (isKeyUnavailable(json)) { lastOwnFailure = json; continue; }
      return send(res, 200, { ...json, userKeyIndex: item.index });
    }
    if (lastOwnFailure) {
      const onlyAuthFailures = lastOwnFailure.code === 401;
      return send(res, 200, { ...lastOwnFailure, code: onlyAuthFailures ? 401 : 402,
        msg: "Semua API key yang terdaftar untuk akun ini sudah habis atau tidak valid. Hubungi admin untuk menambah key/kuota." });
    }

    return send(res, 200, {
      code: 402,
      source: "emix",
      msg: "Semua API key milik akun ini sudah habis atau tidak valid. Hubungi admin untuk menambahkan key baru."
    });
  } catch (e) {
    return send(res, 500, { code: 500, msg: e.message || "Server error" });
  }
}


async function handleKlingCreate(req, res, body) {
  if (!requireUser(req, res)) return;
  const username = getUser(req);
  const ownKeys = userKeys(username);
  if (ownKeys.some((item) => !validKeyFormat(item.key))) return send(res, 422, { code: 422, msg: "Format salah satu API key akun tidak valid. Periksa Environment Variables." });
  const denied = checkAccess(req, true);
  if (denied) return send(res, 401, { code: 401, msg: denied });

  const raw = body.input || {};
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  const image = Array.isArray(raw.input_urls) ? raw.input_urls[0] : "";
  const video = Array.isArray(raw.video_urls) ? raw.video_urls[0] : "";
  const orientation = raw.character_orientation;
  const mode = raw.mode;
  if (!/^https?:\/\//i.test(image || "")) return send(res, 422, { code: 422, msg: "URL gambar harus berupa link http:// atau https:// yang publik." });
  if (!/^https?:\/\//i.test(video || "")) return send(res, 422, { code: 422, msg: "URL video harus berupa link http:// atau https:// yang publik." });
  if (prompt.length > 2500) return send(res, 422, { code: 422, msg: "Prompt maksimal 2500 karakter." });
  if (!["image", "video"].includes(orientation)) return send(res, 422, { code: 422, msg: "Orientasi karakter tidak valid." });
  if (!["720p", "1080p"].includes(mode)) return send(res, 422, { code: 422, msg: "Resolusi harus 720p atau 1080p." });

  const payload = { method: "POST", body: JSON.stringify({
    model: "kling/v2-6-motion-control",
    input: { prompt: prompt || "The character is dancing.", input_urls: [image], video_urls: [video], character_orientation: orientation, mode }
  }) };
  const url = API; // Kling 2.6 docs: POST /api/v1/client/tasks
  try {
    let lastOwnFailure = null;
    for (const item of ownKeys) {
      const json = await call(item.key, url, payload);
      if (isKeyUnavailable(json)) { lastOwnFailure = json; continue; }
      return send(res, 200, { ...json, userKeyIndex: item.index });
    }
    if (lastOwnFailure) {
      return send(res, 200, { ...lastOwnFailure, code: lastOwnFailure.code === 401 ? 401 : 402,
        msg: "Semua API key yang terdaftar untuk akun ini sudah habis atau tidak valid. Hubungi admin untuk menambah key/kuota." });
    }
    const keys = getKeys();
    if (!keys.length) return send(res, 200, { code: 500, msg: "Belum ada API key default di server. Isi EMIX_API_KEYS atau keys.txt." });
    let order = keys.map((_, i) => i).filter((i) => !dead.has(i));
    if (!order.length) { dead.clear(); order = keys.map((_, i) => i); }
    let lastFailure = null; const failureCodes = [];
    for (const i of order) {
      const json = await call(keys[i], url, payload);
      if (json.code === 402 || json.code === 401) { dead.add(i); lastFailure = json; failureCodes.push(json.code); continue; }
      return send(res, 200, { ...json, keyIndex: i, keyCount: keys.length });
    }
    const onlyAuthFailures = failureCodes.length > 0 && failureCodes.every((code) => code === 401);
    return send(res, 200, { code: onlyAuthFailures ? 401 : 402, source: "emix", upstreamStatus: lastFailure ? lastFailure.upstreamStatus : null,
      msg: onlyAuthFailures ? "Semua API key default ditolak Emix (401). Periksa EMIX_API_KEYS di Vercel dan pastikan key masih aktif di dashboard Emix." + (lastFailure && lastFailure.msg ? " Detail Emix: " + String(lastFailure.msg).slice(0, 240) : "") : "Semua API key default kehabisan saldo atau tidak valid." });
  } catch (e) { return send(res, 500, { code: 500, msg: e.message || "Server error" }); }
}

async function handleStatus(req, res) {
  if (req.method !== "GET") return send(res, 405, { code: 405, msg: "Gunakan GET" });
  if (!requireUser(req, res)) return;
  const q = new URL(req.url, "http://localhost").searchParams;
  const id = q.get("taskId") || "";
  if (!/^[\w-]{6,100}$/.test(id)) return send(res, 422, { code: 422, msg: "taskId tidak valid" });

  const username = getUser(req);
  const ownKeys = userKeys(username);
  const denied = checkAccess(req, true);
  if (denied) return send(res, 401, { code: 401, msg: denied });

  const idxRaw = q.get("keyIndex");
  const idx = idxRaw === null || idxRaw === "" ? 0 : Number(idxRaw);
  const selected = ownKeys.find((item) => item.index === idx);
  const key = selected && selected.key;
  if (!key) return send(res, 422, { code: 422, msg: "Key status tidak valid untuk akun ini. Mulai generate ulang atau hubungi admin." });
  if (!validKeyFormat(key)) return send(res, 422, { code: 422, msg: "Format API key tidak valid" });
  try {
    // Endpoint status terpadu dari dokumentasi terbaru; endpoint jobs lama sebagai fallback.
    const t = encodeURIComponent(id);
    const candidates = [
      API + "?taskId=" + t,
      API + "/" + t,
      API_ROOT + "/jobs/recordInfo?taskId=" + t,
    ];
    let json = null;
    for (const url of candidates) {
      const candidate = await call(key, url, { method: "GET" });
      json = candidate;
      if (candidate.code === 200 && candidate.data) break;
      if (![404, 405, 400, 422].includes(candidate.code)) break;
    }
    return send(res, 200, json || { code: 502, msg: "Tidak ada respons status task dari Emix", source: "emix" });
  } catch (e) {
    return send(res, 500, { code: 500, msg: e.message || "Server error" });
  }
}

module.exports = { handleLogin, handleCreate, handleStatus, handleInfo, send };
