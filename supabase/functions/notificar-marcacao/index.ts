// =====================================================================
// Envia um aviso Web Push à dona quando entra uma marcação nova.
//
// Sem bibliotecas: usa apenas as APIs nativas (fetch e WebCrypto).
//   RFC 8291 — encriptação da mensagem
//   RFC 8292 — identificação do remetente (VAPID)
//
// Variáveis: PUSH_SEGREDO, VAPID_PUBLICA, VAPID_PRIVADA, VAPID_CONTACTO
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidas pelo Supabase)
// =====================================================================

const env = (nome: string) => {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Falta a variável ${nome}`);
  return v;
};

const texto = new TextEncoder();

function paraBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function paraB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function juntar(...partes: Uint8Array[]): Uint8Array {
  const res = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    res.set(p, i);
    i += p.length;
  }
  return res;
}

async function hkdf(sal: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const chave = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: sal, info },
    chave,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

// RFC 8291: mensagem encriptada em aes128gcm para este dispositivo.
async function encriptar(p256dh: string, auth: string, mensagem: Uint8Array) {
  const publicaDisp = paraBytes(p256dh);
  const chaveDisp = await crypto.subtle.importKey(
    "raw", publicaDisp, { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const efemera = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  ) as CryptoKeyPair;
  const publicaEfemera = new Uint8Array(await crypto.subtle.exportKey("raw", efemera.publicKey));
  const partilhado = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: chaveDisp }, efemera.privateKey, 256,
  ));

  const ikm = await hkdf(
    paraBytes(auth),
    partilhado,
    juntar(texto.encode("WebPush: info\0"), publicaDisp, publicaEfemera),
    32,
  );
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, texto.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sal, ikm, texto.encode("Content-Encoding: nonce\0"), 12);

  const chaveAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    chaveAes,
    juntar(mensagem, new Uint8Array([2])),
  ));

  const tamanhoRegisto = new Uint8Array(4);
  new DataView(tamanhoRegisto.buffer).setUint32(0, 4096);
  return juntar(sal, tamanhoRegisto, new Uint8Array([publicaEfemera.length]), publicaEfemera, cifrado);
}

// RFC 8292: assinatura que identifica o remetente perante o serviço de push.
async function cabecalhoVapid(endpoint: string) {
  const publica = env("VAPID_PUBLICA");
  const p = paraBytes(publica);
  const chave = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: paraB64url(p.slice(1, 33)),
      y: paraB64url(p.slice(33, 65)),
      d: env("VAPID_PRIVADA"),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const parte = (o: unknown) => paraB64url(texto.encode(JSON.stringify(o)));
  const corpo = `${parte({ typ: "JWT", alg: "ES256" })}.${parte({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env("VAPID_CONTACTO"),
  })}`;
  const assinatura = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, chave, texto.encode(corpo),
  ));
  return `vapid t=${corpo}.${paraB64url(assinatura)}, k=${publica}`;
}

async function baseDados(caminho: string, opcoes: RequestInit = {}) {
  const chave = env("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: { apikey: chave, Authorization: `Bearer ${chave}` },
  });
  if (!r.ok) throw new Error(`Base de dados: ${r.status}`);
  return r.status === 204 ? null : r.json();
}

type Subscricao = { id: string; endpoint: string; p256dh: string; auth: string };

async function enviar(s: Subscricao, mensagem: Uint8Array) {
  const r = await fetch(s.endpoint, {
    method: "POST",
    headers: {
      Authorization: await cabecalhoVapid(s.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body: await encriptar(s.p256dh, s.auth, mensagem),
  });
  // 404/410: o dispositivo deixou de existir, já não vale a pena guardar.
  if (r.status === 404 || r.status === 410) {
    await baseDados(`push_subscricoes?id=eq.${s.id}`, { method: "DELETE" });
  }
  return r.status;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST" || req.headers.get("x-segredo") !== env("PUSH_SEGREDO")) {
    return new Response("Proibido", { status: 401 });
  }

  const { marcacao_id: id } = await req.json();
  if (!UUID.test(String(id))) return new Response("Pedido inválido", { status: 400 });

  const [m] = await baseDados(`marcacoes?id=eq.${id}&select=id,nome,inicio,marcacao_servicos(nome)`);
  if (!m) return new Response("Marcação não encontrada", { status: 404 });

  const quando = new Date(m.inicio).toLocaleString("pt-PT", {
    weekday: "short", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon",
  });
  const servicos = m.marcacao_servicos.map((s: { nome: string }) => s.nome).join(" · ");
  const mensagem = texto.encode(JSON.stringify({
    id: m.id,
    titulo: "Nova marcação",
    corpo: `${m.nome} — ${quando}\n${servicos}`,
  }));

  const subscricoes: Subscricao[] = await baseDados("push_subscricoes?select=id,endpoint,p256dh,auth");
  const estados = await Promise.allSettled(subscricoes.map((s) => enviar(s, mensagem)));

  return Response.json({
    enviados: estados.map((e) => e.status === "fulfilled" ? e.value : "erro"),
  });
});
