// =====================================================================
// eklenti/vibento/hooks/kimlik-mantik.mjs — PreToolUse kimlik kanıtı (3g-3b ②; bugünkü kanca 07-guncelleme-ana.mjs aracKimligiCiktisi,
// sözleşme docs/sozlesme-guvenlik-paketi.md §1.2, Ek 2). Değişmez 14: ağ yok, depo yazımı yok; yalnız jeton okunur.
//
// Vibento aracının `kaynak_oturum`'u Claude Code'un oturum kimliği + kanıtla EZİLİR: '<oturum>.k1.<kanıt>'. Kanıt = HMAC-SHA256(anahtar =
// sha256hex(jeton) UTF-8, veri = "vibento-kimlik-v1\n<oturum>\n") hex, ilk 32. Node yok: Web Crypto (`crypto.subtle`). Fark testi
// (tests/eklenti-kimlik.test.mjs) aynı girdide Node'un createHmac'iyle aynı kanıtı ölçer.
// =====================================================================

import { KIMLIK_ARACLARI, OKUMA_ARACLARI } from './kimlik-araclari.mjs';

const ETIKET = 'vibento-kimlik-v1';
const AYRAC = '.k1.';
const UZUNLUK = 32;
const OTURUM = /^[A-Za-z0-9_-]{1,128}$/;
// Kullanıcı düzeyi MCP adı (bugünkü kurulum) ve eklentinin kendi MCP sunucusu (3g-B: `mcp__plugin_<eklenti>_<sunucu>__`).
const ONEKLER = ['mcp__vibento__', 'mcp__plugin_vibento_vibento__'];

const hex = (tampon) => Array.from(new Uint8Array(tampon), (b) => b.toString(16).padStart(2, '0')).join('');

const sha256 = async (bayt) => new Uint8Array(await crypto.subtle.digest('SHA-256', bayt));

// HMAC-SHA256 (RFC 2104) yalnız `digest` ile: mod ortamında `crypto.subtle.importKey/sign` YOK (ölçüldü 2 Kas, `claude plugin test` 2.1.314).
async function hmacSha256(anahtar, veri) {
  const BLOK = 64;
  let k = anahtar.length > BLOK ? await sha256(anahtar) : anahtar;
  const dolgulu = new Uint8Array(BLOK);
  dolgulu.set(k);
  k = dolgulu;
  const ic = new Uint8Array(BLOK + veri.length);
  const dis = new Uint8Array(BLOK + 32);
  for (let i = 0; i < BLOK; i += 1) { ic[i] = k[i] ^ 0x36; dis[i] = k[i] ^ 0x5c; }
  ic.set(veri, BLOK);
  dis.set(await sha256(ic), BLOK);
  return sha256(dis);
}

/** Kanıt (32 küçük harf hex) ya da jeton geçersizse null. */
export async function kimlikKaniti(jeton, oturum) {
  if (typeof jeton !== 'string' || jeton.length === 0) return null;
  const kodla = new TextEncoder();
  const anahtarHex = hex(await sha256(kodla.encode(jeton)));
  const imza = await hmacSha256(kodla.encode(anahtarHex), kodla.encode(`${ETIKET}\n${oturum}\n`));
  return hex(imza).slice(0, UZUNLUK);
}

/** Aracın Vibento adı (öneksiz) ya da null. */
export function vibentoAracAdi(aracAdi) {
  if (typeof aracAdi !== 'string') return null;
  for (const onek of ONEKLER) if (aracAdi.indexOf(onek) === 0 && aracAdi.length > onek.length) return aracAdi.slice(onek.length);
  return null;
}

/**
 * Yalnız eklentinin SALT OKUYAN araçları izin sormaz; yazanlar (pencereye mesaj, not, kart, görev) Claude Code'un olağan iznine kalır. Neden: enjeksiyon
 * insan kapısı olmadan başka pencerelere ve ortak işlere yayılmasın (tarama 2 Kas Y2; karar 2 Kas, ürün sahibinin denemesinde yeniden değerlendirilecek).
 * Yalnız eklentinin tanımladığı sunucu (`mcp__plugin_vibento_vibento__`): kullanıcı düzeyi `mcp__vibento__` kullanıcının kendi izin kuralına kalır,
 * aynı adlı başka bir sunucu bu izni alamaz. Altta bir karar varsa (ask/deny/allow) ezilmez: çağıran denetler.
 */
export function izinVerilirMi(aracAdi) {
  const onek = 'mcp__plugin_vibento_vibento__';
  // Tarama O1: yalnız önek yetmez, başka bir sunucu aynı öneki taşıyabilir; bilinen araç adıyla sınırlı.
  return typeof aracAdi === 'string' && aracAdi.startsWith(onek) && OKUMA_ARACLARI.includes(aracAdi.slice(onek.length));
}

/**
 * Yeni araç girdisi ya da null (dokunma). `girdi` yoksa boş nesne; nesne olmayan girdi → null. Oturum kimliği biçim dışıysa kanıtsız yazılır.
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function aracKimligiGirdisi(aracAdi, oturum, girdi, jeton) {
  const ad = vibentoAracAdi(aracAdi);
  if (ad === null) return null;
  if (typeof oturum !== 'string' || oturum.trim().length === 0) return null;
  const g = girdi === undefined || girdi === null ? {} : girdi;
  if (typeof g !== 'object' || Array.isArray(g)) return null;
  const listede = KIMLIK_ARACLARI.indexOf(ad) !== -1;
  const kendiAlani = Object.prototype.hasOwnProperty.call(g, 'kaynak_oturum');
  if (!listede && !kendiAlani) return null;
  let deger = oturum;
  if (OTURUM.test(oturum)) {
    try {
      const kanit = await kimlikKaniti(jeton, oturum);
      if (kanit !== null) deger = oturum + AYRAC + kanit;
    } catch {
      deger = oturum;
    }
  }
  return { ...g, kaynak_oturum: deger };
}
