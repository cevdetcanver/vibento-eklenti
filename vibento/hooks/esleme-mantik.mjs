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
export const SURUM = '0.1.10';
export const BAGLANTI_ANAHTARI = 'vibento.baglanti';
export const ESLEME_ANAHTARI = 'vibento.esleme';
export const VARSAYILAN_SUNUCU = 'https://vibento.app';
export const EN_KISA_ARALIK_SN = 5;
export const YAVASLA_EK_SN = 5;
// Kod geçerliyken istem kancasında en çok bu kadar istemde hatırlatılır (sözleşme §1 adım 2).
export const ISTEM_HATIRLATMA = 3;
// Jeton 30 günde bir yenilenir (sözleşme §4 "kendiliğinden yenilenen").
export const YENILEME_GUN = 30;
// Sonu yaklaşan kod gösterilmez: kullanıcı siteye yazana kadar dolar, yeni kod istenir (2 Kas Mac ölçümü).
export const KOD_ASGARI_MS = 120_000;
// Açık konuşmada yeni kod isteme aralığı ve tavanı: her istem sunucuya gitmesin, IP kotası (saatte 10) bir makine yüzünden bitmesin.
export const KOD_ISTEK_ARALIGI_MS = 60_000;
export const KOD_ISTEK_TAVANI = 3;
// İstem turu kod için en çok bu kadar bekler (kanca turu bozmaz); yanıt geç gelirse depoya yine yazılır, sonraki istemde görünür.
export const KOD_ISTEK_BUTCESI_MS = 4_000;
// Sunucu onaylı kodu bitişten sonra da bu kadar teslim eder (0043): gösterilmeyen kod da yoklanır, yoksa onaylanan kod teslim alınmaz.
export const TESLIM_EK_MS = 600_000;

const KOD = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const CIHAZ_KODU = /^[A-Za-z0-9_-]{43}$/;
const JETON = /^vib_[A-Za-z0-9_-]{20,200}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sunucu adresi: yalnız vibento.app ya da yerel geliştirme (localhost / 127.0.0.1). Başka her değer varsayılana döner: jeton başka adrese gitmez. */
export function sunucuAdresi(deger) {
  if (typeof deger !== 'string' || !deger.trim()) return VARSAYILAN_SUNUCU;
  let u;
  try { u = new URL(deger.trim()); } catch { return VARSAYILAN_SUNUCU; }
  const yerel = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (!yerel && !(u.protocol === 'https:' && u.hostname === 'vibento.app')) return VARSAYILAN_SUNUCU;
  if (yerel && u.protocol !== 'http:' && u.protocol !== 'https:') return VARSAYILAN_SUNUCU;
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

/** Doğrulama adresi yalnız bağlanılan sunucunun `/bagla` sayfası: ele geçirilmiş yanıt kullanıcıyı başka yere yönlendiremez, satıra metin taşıyamaz (tarama Ek 8 O4, Ek 9 D5). */
function dogrulamaAdresi(deger, sunucu) {
  return deger === `${new URL(sunucu).origin}/bagla` ? deger : null;
}

/**
 * `POST /api/esleme/baslat` yanıtı → { tur: 'kod', … } | { tur: 'sinir' } | { tur: 'hata' }.
 * @param {number} durum
 * @param {string} metin
 * @param {string} [sunucu]
 * @returns {{ tur: 'kod', kullanici_kodu: string, cihaz_kodu: string, bitis: string, aralik: number, dogrulama_adresi: string | null }
 *   | { tur: 'sinir' } | { tur: 'hata' }}
 */
export function baslatYanitiOku(durum, metin, sunucu = VARSAYILAN_SUNUCU) {
  const v = json(metin);
  if (durum === 429) return { tur: 'sinir' };
  if (durum !== 200 || !v || v.ok !== true) return { tur: 'hata' };
  if (typeof v.kullanici_kodu !== 'string' || !KOD.test(v.kullanici_kodu)) return { tur: 'hata' };
  if (typeof v.cihaz_kodu !== 'string' || !CIHAZ_KODU.test(v.cihaz_kodu)) return { tur: 'hata' };
  const bitis = Date.parse(String(v.bitis));
  if (!Number.isFinite(bitis)) return { tur: 'hata' };
  const aralik = Math.max(EN_KISA_ARALIK_SN, Number.isFinite(Number(v.aralik)) ? Math.floor(Number(v.aralik)) : EN_KISA_ARALIK_SN);
  return { tur: 'kod', kullanici_kodu: v.kullanici_kodu, cihaz_kodu: v.cihaz_kodu, bitis: new Date(bitis).toISOString(), aralik, dogrulama_adresi: dogrulamaAdresi(v.dogrulama_adresi, sunucu) };
}

/**
 * `POST /api/esleme/jeton` yanıtı → { tur: 'bekliyor' } | { tur: 'yavasla' } | { tur: 'tamam', token, baglanti_id }
 * | { tur: 'zaten_teslim' } (başka pencere aldı; depoya bak) | { tur: 'bitti' } (süre doldu / reddedildi / yok; yeni kod) | { tur: 'hata' }.
 * @param {number} durum
 * @param {string} metin
 * @returns {{ tur: 'tamam', token: string, baglanti_id: string, hesap_ad: string | null, eposta_maskeli: string | null }
 *   | { tur: 'bekliyor' | 'yavasla' | 'zaten_teslim' | 'bitti' | 'hata' }}
 */
export function teslimYanitiOku(durum, metin) {
  const v = json(metin);
  if (!v || typeof v.durum !== 'string') return { tur: 'hata' };
  if (durum === 200 && v.durum === 'tamam') {
    if (typeof v.token !== 'string' || !JETON.test(v.token)) return { tur: 'hata' };
    if (typeof v.baglanti_id !== 'string' || !UUID.test(v.baglanti_id)) return { tur: 'hata' };
    const metin = (d) => (typeof d === 'string' && d.trim() ? d.trim().slice(0, 120) : null);
    return { tur: 'tamam', token: v.token, baglanti_id: v.baglanti_id, hesap_ad: metin(v.hesap_ad), eposta_maskeli: metin(v.eposta_maskeli) };
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

function bekleyenBitisi(bekleyen, sunucu) {
  if (!bekleyen || typeof bekleyen !== 'object') return NaN;
  if (bekleyen.sunucu !== sunucu) return NaN;
  if (typeof bekleyen.kullanici_kodu !== 'string' || !KOD.test(bekleyen.kullanici_kodu)) return NaN;
  if (typeof bekleyen.cihaz_kodu !== 'string' || !CIHAZ_KODU.test(bekleyen.cihaz_kodu)) return NaN;
  return Date.parse(String(bekleyen.bitis));
}

/** Depodaki kod kullanıcıya gösterilebilir mi (aynı sunucu, biçim doğru, siteye yazılacak kadar süresi var). */
export function bekleyenGecerli(bekleyen, sunucu, simdi) {
  const bitis = bekleyenBitisi(bekleyen, sunucu);
  return Number.isFinite(bitis) && bitis > simdi + KOD_ASGARI_MS;
}

/** Depodaki kod hâlâ yoklanmalı mı: kullanıcı onu daha önce gördü, sunucu da onaylıysa bitişten sonra teslim eder. */
export function bekleyenYoklanabilir(bekleyen, sunucu, simdi) {
  const bitis = bekleyenBitisi(bekleyen, sunucu);
  return Number.isFinite(bitis) && bitis + TESLIM_EK_MS > simdi;
}

/**
 * Yoklanacak cihaz kodları: depodaki kod, yerine yenisi istenmiş ama hâlâ teslim edilebilen eski kod ve bu pencerenin kendi kodu. İki sekme aynı
 * anda kod isterse sonra yazan öncekini ezer; kullanıcı ezilen kodu görmüş olabilir, sahibi yoklamazsa onaylanan kod teslim alınmaz (㉕ E5).
 * @param {any} bekleyen
 * @param {number} simdi
 * @param {{ cihaz_kodu: string, bitis: string } | null} [kendi]
 * @returns {string[]}
 */
export function yoklanacakKodlar(bekleyen, simdi, kendi = null) {
  const kodlar = bekleyen ? [bekleyen.cihaz_kodu] : [];
  for (const o of [bekleyen?.onceki, kendi]) {
    if (o && typeof o.cihaz_kodu === 'string' && CIHAZ_KODU.test(o.cihaz_kodu) && Date.parse(String(o.bitis)) + TESLIM_EK_MS > simdi && !kodlar.includes(o.cihaz_kodu)) kodlar.push(o.cihaz_kodu);
  }
  return kodlar;
}

/** Cihaz adı olarak işe yaramayan değerler: Mac `hostname`'i iç ağ adresi dönebiliyor (2 Kas ölçüldü, kartta anlamsız ve adres sızıyor). */
export function cihazAdiTemizle(ham) {
  if (typeof ham !== 'string') return null;
  const tam = ham.trim();
  if (!tam || tam.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(tam)) return null;
  // Alan adı kısmı (`x.corp.firma.com`, `.local`) atılır; `192-168-1-61` ya da `ip-10-0-0-1` gibi adres taşıyan ad da ad sayılmaz.
  const ad = /\s/.test(tam) ? tam : tam.split('.')[0];
  if (!ad || /(^|[^0-9])\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}($|[^0-9])/.test(ad)) return null;
  return ad.slice(0, 80);
}

/** Sunucu anahtarı reddedince görünen ek: pencere sessizce kopmasın (tarama 2 Kas Y1, O5). */
export const KOPMA_ON_SATIRI = "Vibento: bu bilgisayarın bağlantısı kesildi; anahtar başka bir bilgisayara devredilmiş ya da iptal edilmiş olabilir ve kayıtlar Vibento'ya gitmiyor. Beklemiyorsan vibento.app › Bilgisayarlar sayfasına bak.";
export const KOPMA_BILDIRIMI = 'Vibento bağlantısı kesildi. Sonraki mesajda yeniden bağlama kodu gelir.';

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
    + `(${kalanDk} dk geçerli). Kullanıcıya bu satırı aynen göster; kodu kendin bir yere girme. Sonraki turlarda bu kodu tekrar etme: süresi dolan kod çalışmaz, gerekince yeni satır gelir.`;
}

/** Bağlandıktan sonra bir kez gösterilen satır: HANGİ hesaba bağlandığını söyler (başkası kodu kendi hesabında onayladıysa fark edilsin). */
export function baglandiSatiri(hesapAd, epostaMaskeli) {
  const kim = hesapAd ? `"${hesapAd}"${epostaMaskeli ? ` (${epostaMaskeli})` : ''} çalışma alanına` : 'Vibento hesabına';
  return `Vibento: bu bilgisayar ${kim} bağlandı; sohbet kayıtları artık oraya yazılır. Bu sen değilsen hemen kullanıcıya söyle: bağlantı vibento.app'te iptal edilmeli. Kullanıcıya bu satırı aynen göster.`;
}
