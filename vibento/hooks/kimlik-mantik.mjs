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
// 0.1.26 (D2b; sözleşme docs/sozlesme-unvanlar.md Ek D2 "D2b"): kanıt, çağrının hangi TURDA yapıldığını da taşır:
// '<oturum>.k2.<tur kimliği>.<kanıt>'; kanıt = HMAC-SHA256(anahtar aynen, veri = "vibento-kimlik-v2\n<oturum>\n<tur kimliği>\n") hex, ilk 32.
// Tur kimliği = o turu başlatan istem olayının `olay_kimligi`'si (eklenti üretir, istemle birlikte sunucuya gider). Sunucu böylece "bu çağrı
// kullanıcının SON istemiyle başlayan turda mı" sorusunu kayıttan cevaplar. Tur kimliği yoksa ya da biçimsizse eski biçim (`k1`) yazılır.
const ETIKET2 = 'vibento-kimlik-v2';
const AYRAC2 = '.k2.';
const TUR = /^[A-Za-z0-9_-]{8,64}$/;
/** Turun kimliğinin depodaki anahtarı (istemde yazılır, araç çağrısında okunur); oturum kimliği biçimsizse null. */
export function turAnahtari(seansId) {
  if (typeof seansId !== 'string') return null;
  const ad = seansId.replace(/[^A-Za-z0-9_-]/g, '');
  return ad.length > 0 ? `vibento.tur.${ad}` : null;
}
/**
 * Depodan okunan değer geçerli bir tur kimliği mi.
 * @param {unknown} d
 * @returns {d is string}
 */
export const turKimligiGecerli = (d) => typeof d === 'string' && TUR.test(d);
/** "Sunucu tur kimlikli kanıtı tanıyor" kaydının depodaki anahtarı (oturum başına); oturum kimliği biçimsizse null. */
export function kanitAnahtari(seansId) {
  if (typeof seansId !== 'string') return null;
  const ad = seansId.replace(/[^A-Za-z0-9_-]/g, '');
  return ad.length > 0 ? `vibento.kanit.${ad}` : null;
}
// Tur kimlikli kanıtın metindeki izi: `.k2.<tur kimliği>.<32 hex>` (oturum kimliği kalır). Sınırlı tekrar: doğrusal.
const KANIT2_IZI = /\.k2\.[A-Za-z0-9_-]{8,64}\.[0-9a-f]{32}(?![0-9a-f])/g;
/** Süzülen kanıtın yerine yazılan işaret (günlük süzgecinin `kimlik_kaniti` işaretiyle aynı). */
export const KANIT_ISARETI = '[GİZLİ:kimlik_kaniti]';
/**
 * Günlük süzgecini (`gizliSuz`: `{ metin, sayi, turler }`) tur kimlikli kanıtı da silen süzgece çevirir; dönüş biçimi aynı.
 * Neden ayrı bir sarmal (güvenlik taraması 13 Kas B2): `gizliSuz` eski kancaya da gömülür ve o metin imzalıdır; yalnız `.k1.` kanıtını
 * tanır. Eklenti 0.1.26 `k2` yazar: araç girdisi olarak yerel dökümde kalabilir, eşitlemeyle sunucuya ve `gunluk_ara` ile aynı
 * bağlantının başka penceresine ulaşırdı. Tur kimliği kanıtla birlikte gider (ikisi birlikte yeniden kullanılabilir).
 * Sunucudaki eşi: `src/server/gunluk/kanit-suzgeci.mjs` (aynı tanım; fark testi `tests/suzgec.test.mjs`).
 * @param {(metin: string) => { metin: string, sayi: number, turler: Record<string, number> }} gizliSuz
 */
export function kanitliSuzgec(gizliSuz) {
  return (metin) => {
    const s = gizliSuz(metin);
    let adet = 0;
    const temiz = String(s.metin).replace(KANIT2_IZI, () => { adet += 1; return KANIT_ISARETI; });
    if (adet === 0) return s;
    return { metin: temiz, sayi: s.sayi + adet, turler: { ...s.turler, kimlik_kaniti: (s.turler?.kimlik_kaniti ?? 0) + adet } };
  };
}

/**
 * Sunucunun yanıtındaki kanıt sürümü: `2` (tur kimlikli kanıtı tanıyor) · `0` (yanıt var, alan yok ya da başka değer: tanımıyor) ·
 * `null` (yanıt yok: bilinmiyor, son bilinen değer kalır). Sunucu geri alınırsa eklenti bir sonraki yanıtla eski biçime döner.
 * @param {unknown} govde
 * @returns {2 | 0 | null}
 */
export function kanitSurumuOku(govde) {
  if (!govde || typeof govde !== 'object' || Array.isArray(govde)) return null;
  return /** @type {Record<string, unknown>} */ (govde).kanit_surumu === 2 ? 2 : 0;
}
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

/** Tur kimlikli kanıt (32 küçük harf hex) ya da jeton geçersizse null. Veri oturumu VE turu bağlar: biri değişirse kanıt tutmaz. */
export async function kimlikKaniti2(jeton, oturum, tur) {
  if (typeof jeton !== 'string' || jeton.length === 0) return null;
  const kodla = new TextEncoder();
  const anahtarHex = hex(await sha256(kodla.encode(jeton)));
  const imza = await hmacSha256(kodla.encode(anahtarHex), kodla.encode(`${ETIKET2}\n${oturum}\n${tur}\n`));
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
 * `turKimligi` geçerliyse kanıt tur kimlikli biçimde (`k2`), değilse eski biçimde (`k1`) yazılır.
 * @param {unknown} aracAdi
 * @param {unknown} oturum
 * @param {unknown} girdi
 * @param {unknown} jeton
 * @param {unknown} [turKimligi]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function aracKimligiGirdisi(aracAdi, oturum, girdi, jeton, turKimligi = null) {
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
      if (turKimligiGecerli(turKimligi)) {
        const kanit2 = await kimlikKaniti2(jeton, oturum, turKimligi);
        if (kanit2 !== null) deger = oturum + AYRAC2 + turKimligi + '.' + kanit2;
      } else {
        const kanit = await kimlikKaniti(jeton, oturum);
        if (kanit !== null) deger = oturum + AYRAC + kanit;
      }
    } catch {
      deger = oturum;
    }
  }
  return { ...g, kaynak_oturum: deger };
}
