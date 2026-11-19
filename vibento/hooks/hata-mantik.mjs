// =====================================================================
// eklenti/vibento/hooks/hata-mantik.mjs — motorun atladığı kancanın kaydı (saf mantık; sözleşme docs/sozlesme-kanca-hatasi.md).
//
// Neden var (19 Kas ölçümü, RESEARCH 13:01): Claude Code kanca işçisi bir kanca uçuştayken 5 sn yanıt vermezse işçiyi yeniden kurar ve
// o kancanın `.catch`'i YOKSA eklentiyi oturumun sonuna kadar boşaltır (15 Kas olayı). Her kancanın `.catch`'i eklentiyi yüklü tutar;
// bu dosya o kapının yazdığı kaydı kurar. Kayıt depoda oturum başına durur, sıradaki olay gövdesiyle sunucuya gider (`olay.ts`).
// Değişmez 4 (metin gitmez): motorun neden METNİ saklanmaz ve gönderilmez; yalnız türü, sınıfı ve uzunluğu (motorun kendi günlüğü de
// öyle yazar: "errorKind=… errorChars=…"). Node, DOM, `$` yok.
// =====================================================================

export const HATA_ANAHTAR_ONEKI = 'vibento.kanca-hata.';
/** Depoda oturum başına en çok bu kadar kayıt (en yeniler kalır). */
export const HATA_TAVANI = 20;
/** Bir olay gövdesinde en çok bu kadar kayıt (en eskiler önce gider). */
export const HATA_GONDERIM_TAVANI = 10;
export const HATA_UZUNLUK_TAVANI = 100_000;

/** Eklentinin kaydettiği kancalar; `register.ts` ve `kart.tsx` bu adlarla çağırır, sunucu aynı listeyi bekler (`src/lib/kanca-hatasi.mjs`). */
export const HATA_KANCALARI = Object.freeze([
  'turn.start', 'turn.complete',
  'classic.SessionStart', 'classic.UserPromptSubmit', 'classic.PreToolUse', 'classic.Stop', 'classic.PreCompact', 'classic.SessionEnd',
  'ui.render.UserMessage', 'ui.render.AssistantMessage',
]);
export const HATA_TURLERI = Object.freeze(['throw', 'timeout']);
export const HATA_SINIFLARI = Object.freeze(['isci_takildi', 'isci_kayboldu', 'sure', 'bicim', 'diger']);

/** Depo anahtarı: oturum kimliğinin yalnız [A-Za-z0-9_-] kısmı; boşsa null (`teslimAnahtari` ile aynı kural). */
export function hataAnahtari(seansId) {
  if (typeof seansId !== 'string') return null;
  const ad = seansId.replace(/[^A-Za-z0-9_-]/g, '');
  return ad.length > 0 && ad.length <= 200 ? `${HATA_ANAHTAR_ONEKI}${ad}` : null;
}

/**
 * Motorun neden metni sınıfa iner. Cümleler Claude Code 2.1.327'den ölçüldü: "no answer to a heartbeat within 5000ms: the hooks worker is
 * wedged (a hook spinning without yielding)" · "returned something that is not a result object" · süre aşımında metin boş. Tanınmayan
 * metin `diger` olur; metnin kendisi hiçbir kola girmez.
 */
export function hataSinifi(tur, mesaj) {
  if (tur === 'timeout') return 'sure';
  const m = typeof mesaj === 'string' ? mesaj : '';
  if (/heartbeat|wedged/i.test(m)) return 'isci_takildi';
  if (/hooks worker/i.test(m)) return 'isci_kayboldu';
  if (/not a result object/i.test(m)) return 'bicim';
  return 'diger';
}

/**
 * Hata kapısının yazdığı kayıt. `hata` motorun `next.error`'ıdır (`{ kind, message? }`); `cagrildi` kancanın `next`'i çağırıp çağırmadığı.
 * Kanca adı listede yoksa ya da saat okunamadıysa null (kayıt yazılmaz).
 */
export function hataKaydi(kanca, hata, cagrildi, simdiMs) {
  if (!HATA_KANCALARI.includes(kanca)) return null;
  if (typeof simdiMs !== 'number' || !Number.isFinite(simdiMs)) return null;
  const tur = hata && hata.kind === 'timeout' ? 'timeout' : 'throw';
  const mesaj = hata && typeof hata.message === 'string' ? hata.message : '';
  return {
    kanca,
    tur,
    sinif: hataSinifi(tur, mesaj),
    uzunluk: Math.min(mesaj.length, HATA_UZUNLUK_TAVANI),
    cagrildi: cagrildi === true,
    at: new Date(simdiMs).toISOString(),
  };
}

/** Kaydın biçimi tam mı (depodan okunan ve gövdeye giren her kayıt bundan geçer; fazla alan taşıyan kayıt geçmez). */
export function hataGecerli(k) {
  if (typeof k !== 'object' || k === null || Array.isArray(k)) return false;
  const adlar = Object.keys(k).sort().join(',');
  if (adlar !== 'at,cagrildi,kanca,sinif,tur,uzunluk') return false;
  return HATA_KANCALARI.includes(k.kanca)
    && HATA_TURLERI.includes(k.tur)
    && HATA_SINIFLARI.includes(k.sinif)
    && Number.isInteger(k.uzunluk) && k.uzunluk >= 0 && k.uzunluk <= HATA_UZUNLUK_TAVANI
    && typeof k.cagrildi === 'boolean'
    && saatGecerli(k.at);
}

/** Saat tam `toISOString` biçiminde ve gerçek bir an (30 Şubat, 24:00 gibi değerler ayrıştırılsa da geri aynı yazılmaz: geçmez). */
function saatGecerli(at) {
  if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at)) return false;
  const an = Date.parse(at);
  return Number.isFinite(an) && new Date(an).toISOString() === at;
}

/** Depodaki liste: yalnız geçerli kayıtlar, en yeni `HATA_TAVANI` tanesi. Dizi değilse boş. */
export function hataListesi(ham) {
  const liste = Array.isArray(ham) ? ham.filter(hataGecerli) : [];
  return liste.length > HATA_TAVANI ? liste.slice(liste.length - HATA_TAVANI) : liste;
}

/** Ekleme: sona yazılır, tavan aşılırsa en eskiler düşer. Geçersiz kayıt eklenmez. */
export function hataEkle(mevcut, kayit) {
  const liste = hataListesi(mevcut);
  if (!hataGecerli(kayit)) return liste;
  liste.push(kayit);
  return liste.length > HATA_TAVANI ? liste.slice(liste.length - HATA_TAVANI) : liste;
}

/** Bir gövdeye girecek kayıtlar: en eski `HATA_GONDERIM_TAVANI` tanesi (kalanı sonraki olaya). */
export function hataGonderilecek(ham) {
  return hataListesi(ham).slice(0, HATA_GONDERIM_TAVANI);
}

// Kimlik altı alanın TAMAMIDIR (ikinci okuma): uzunluğu ya da `cagrildi`'si farklı iki kayıt birbirinin yerine düşmez.
const kimlik = (k) => `${k.kanca}|${k.tur}|${k.sinif}|${k.uzunluk}|${k.cagrildi}|${k.at}`;

/**
 * Sunucu aldıktan sonra depoda kalacaklar: gönderilen HER kayıt için depodan BİR eş kayıt düşer, arada eklenen yeni kayıt kalır.
 * Sayarak düşülür (bağımsız okuma 19 Kas, D4): aynı milisaniyede aynı kancadan iki kayıt varsa ve yalnız biri gittiyse öbürü kalır.
 */
export function hataKalan(guncel, gonderilen) {
  const giden = new Map();
  for (const k of (Array.isArray(gonderilen) ? gonderilen : []).filter(hataGecerli)) giden.set(kimlik(k), (giden.get(kimlik(k)) ?? 0) + 1);
  return hataListesi(guncel).filter((k) => {
    const kalan = giden.get(kimlik(k)) ?? 0;
    if (kalan === 0) return true;
    giden.set(kimlik(k), kalan - 1);
    return false;
  });
}
