// =====================================================================
// eklenti/vibento/hooks/esleme-mantik.mjs — eşlemenin SAF mantığı (3g-3; sözleşme docs/sozlesme-3g-esleme.md §1, §4, §5).
//
// Ağ, disk ve zamanlayıcı yok: yanıt okuma, adres doğrulama, açılış satırı, bekleme kararı. Modun kendisi (register.ts) bunları
// `$.http` / `$.store` / `$.clock` ile çağırır; testler (tests/eklenti-esleme.test.mjs) Node'da doğrudan.
//
// Gizlilik: cihaz kodu ve jeton hiçbir metne (bağlam, uyarı, hata) girmez; yalnız `$.store`'a. Kullanıcı kodu bilerek gösterilir.
// =====================================================================

export const ISTEMCI = 'claude-code';
// `.claude-plugin/plugin.json` sürümüyle aynı (test denetler); sunucuya `istemci_surum` olarak gider.
export const SURUM = '0.1.0';
export const BAGLANTI_ANAHTARI = 'vibento.baglanti';
export const ESLEME_ANAHTARI = 'vibento.esleme';
export const VARSAYILAN_SUNUCU = 'https://vibento.app';
export const EN_KISA_ARALIK_SN = 5;
export const YAVASLA_EK_SN = 5;
// Kod geçerliyken istem kancasında en çok bu kadar istemde hatırlatılır (sözleşme §1 adım 2).
export const ISTEM_HATIRLATMA = 3;
// Jeton 30 günde bir yenilenir (sözleşme §4 "kendiliğinden yenilenen").
export const YENILEME_GUN = 30;

const KOD = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const CIHAZ_KODU = /^[A-Za-z0-9_-]{43}$/;
const JETON = /^vib_[A-Za-z0-9_-]{20,200}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sunucu adresi: https, ya da yalnız yerel geliştirmede http (localhost / 127.0.0.1). Bozuksa varsayılan. Sondaki eğik çizgi atılır. */
export function sunucuAdresi(deger) {
  if (typeof deger !== 'string' || !deger.trim()) return VARSAYILAN_SUNUCU;
  let u;
  try { u = new URL(deger.trim()); } catch { return VARSAYILAN_SUNUCU; }
  const yerel = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && yerel)) return VARSAYILAN_SUNUCU;
  if (u.username || u.password || u.search || u.hash) return VARSAYILAN_SUNUCU;
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

function json(metin) {
  try {
    const v = JSON.parse(metin);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/**
 * `POST /api/esleme/baslat` yanıtı → { tur: 'kod', … } | { tur: 'sinir' } | { tur: 'hata' }.
 * @param {number} durum
 * @param {string} metin
 * @returns {{ tur: 'kod', kullanici_kodu: string, cihaz_kodu: string, bitis: string, aralik: number, dogrulama_adresi: string | null }
 *   | { tur: 'sinir' } | { tur: 'hata' }}
 */
export function baslatYanitiOku(durum, metin) {
  const v = json(metin);
  if (durum === 429) return { tur: 'sinir' };
  if (durum !== 200 || !v || v.ok !== true) return { tur: 'hata' };
  if (typeof v.kullanici_kodu !== 'string' || !KOD.test(v.kullanici_kodu)) return { tur: 'hata' };
  if (typeof v.cihaz_kodu !== 'string' || !CIHAZ_KODU.test(v.cihaz_kodu)) return { tur: 'hata' };
  const bitis = Date.parse(String(v.bitis));
  if (!Number.isFinite(bitis)) return { tur: 'hata' };
  const aralik = Math.max(EN_KISA_ARALIK_SN, Number.isFinite(Number(v.aralik)) ? Math.floor(Number(v.aralik)) : EN_KISA_ARALIK_SN);
  const adres = typeof v.dogrulama_adresi === 'string' && /^https?:\/\/[^\s]+$/.test(v.dogrulama_adresi) ? v.dogrulama_adresi : null;
  return { tur: 'kod', kullanici_kodu: v.kullanici_kodu, cihaz_kodu: v.cihaz_kodu, bitis: new Date(bitis).toISOString(), aralik, dogrulama_adresi: adres };
}

/**
 * `POST /api/esleme/jeton` yanıtı → { tur: 'bekliyor' } | { tur: 'yavasla' } | { tur: 'tamam', token, baglanti_id }
 * | { tur: 'zaten_teslim' } (başka pencere aldı; depoya bak) | { tur: 'bitti' } (süre doldu / reddedildi / yok; yeni kod) | { tur: 'hata' }.
 * @param {number} durum
 * @param {string} metin
 * @returns {{ tur: 'tamam', token: string, baglanti_id: string }
 *   | { tur: 'bekliyor' | 'yavasla' | 'zaten_teslim' | 'bitti' | 'hata' }}
 */
export function teslimYanitiOku(durum, metin) {
  const v = json(metin);
  if (!v || typeof v.durum !== 'string') return { tur: 'hata' };
  if (durum === 200 && v.durum === 'tamam') {
    if (typeof v.token !== 'string' || !JETON.test(v.token)) return { tur: 'hata' };
    if (typeof v.baglanti_id !== 'string' || !UUID.test(v.baglanti_id)) return { tur: 'hata' };
    return { tur: 'tamam', token: v.token, baglanti_id: v.baglanti_id };
  }
  if (durum === 200 && (v.durum === 'bekliyor' || v.durum === 'yavasla' || v.durum === 'zaten_teslim')) return { tur: v.durum };
  if (durum === 200 && (v.durum === 'suresi_doldu' || v.durum === 'reddedildi' || v.durum === 'yok')) return { tur: 'bitti' };
  return { tur: 'hata' };
}

/** Depodaki bağlantı kaydı kullanılabilir mi (biçim). Değer hiçbir zaman metne girmez. */
export function baglantiGecerli(kayit) {
  return !!kayit && typeof kayit === 'object' && typeof kayit.token === 'string' && JETON.test(kayit.token)
    && typeof kayit.baglanti_id === 'string' && UUID.test(kayit.baglanti_id) && typeof kayit.sunucu === 'string';
}

/** Depodaki bekleyen eşleme hâlâ kullanılabilir mi (aynı sunucu, süresi dolmamış, biçim doğru). */
export function bekleyenGecerli(bekleyen, sunucu, simdi) {
  if (!bekleyen || typeof bekleyen !== 'object') return false;
  if (bekleyen.sunucu !== sunucu) return false;
  if (typeof bekleyen.kullanici_kodu !== 'string' || !KOD.test(bekleyen.kullanici_kodu)) return false;
  if (typeof bekleyen.cihaz_kodu !== 'string' || !CIHAZ_KODU.test(bekleyen.cihaz_kodu)) return false;
  const bitis = Date.parse(String(bekleyen.bitis));
  return Number.isFinite(bitis) && bitis > simdi + 15_000; // son 15 sn: kullanıcı yetişemez, yeni kod
}

/** Jetonun yenileme zamanı geldi mi. */
export function yenilemeZamani(kayit, simdi) {
  const son = Date.parse(String(kayit?.yenilendi_at ?? kayit?.alindi_at ?? ''));
  if (!Number.isFinite(son)) return true;
  return simdi - son >= YENILEME_GUN * 86_400_000;
}

/** Açılışta ve ilk istemlerde modele (ve kullanıcıya) gösterilen satır. Cihaz kodu GİRMEZ. */
export function kodSatiri(bekleyen, simdi) {
  const kalanDk = Math.max(1, Math.round((Date.parse(bekleyen.bitis) - simdi) / 60_000));
  const adres = bekleyen.dogrulama_adresi ?? `${bekleyen.sunucu}/bagla`;
  return `Vibento: bu bilgisayar henüz bağlı değil. Bağlamak için ${adres} adresinde şu kodu yaz: ${bekleyen.kullanici_kodu} `
    + `(${kalanDk} dk geçerli). Kullanıcıya bu satırı aynen göster; kodu kendin bir yere girme.`;
}

/** Bağlandıktan sonraki ilk istemde bir kez gösterilen satır. */
export const BAGLANDI_SATIRI = 'Vibento: bu bilgisayar bağlandı. Bu pencere artık Vibento işlerine kayıt yazar.';
