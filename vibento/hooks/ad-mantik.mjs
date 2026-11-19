// =====================================================================
// eklenti/vibento/hooks/ad-mantik.mjs — istemde ANILAN pencereler (D2b; sözleşme docs/sozlesme-unvanlar.md §1.4 ve Ek D2 "D2b").
//
// "Kullanıcının sözü yalnız içinde ADI GEÇEN pencereye yeter." İstem metni bilgisayardan çıkmaz (değişmez 4); bu yüzden eşleştirme
// BURADA, yerelde yapılır ve sunucuya yalnız eşleşen pencerelerin BÖLÜM KİMLİKLERİ gider. Ad listesi sunucudan iner (açılışta, istemde
// en çok 10 dakikada bir): aynı klasörün bu pencere dışındaki bölümleri, klasörün kendi adı hariç. Pencerenin adı asıldır, ajanın kod adı
// yardımcıdır (DECISIONS 13 Kas): ikisi de aynı bölüm kimliğine çözülür.
//
// SAF: ağ yok, depo yok, saat yok. Çalışma ortamı Node değildir; yalnız temel dize işlemleri (yerel ayar ve `normalize` kullanılmaz).
// Eşleştirme İZİN VERİR, iş göndermez: yanlış eşleşme yalnız o turda sözün yettiği pencereleri genişletir; eksik eşleşme onaya düşürür.
// =====================================================================

export const ANILAN_TAVANI = 20;
/** Ad listesinin satır tavanı (sunucudaki `AD_LISTESI_TAVANI` ile aynı). Ölçüm 13 Kas: en kalabalık klasörde 18 açık bölüm. */
export const AD_LISTESI_TAVANI = 40;
/** Ad listesi bundan eskiyse eklenti istemde tazeleme ister (`ad_listesi_iste`). */
export const AD_LISTESI_OMRU_MS = 10 * 60 * 1000;
/** Katlanmış hâli bundan kısa ad eşleştirilmez (iki harfli ad her cümlede geçer). */
export const AD_ASGARI = 3;
/** Listeye giren adın en uzun hâli (sunucudaki `AD_UZUNLUK_TAVANI` ile aynı). */
export const AD_AZAMI = 80;
/** Adın ardına bitişik yazılan ek en çok bu kadar harf ("Videoya", "Kasadan", "Hibedeki"); kesme işaretinden sonra daha uzun olabilir. */
export const EK_BITISIK = 4;
export const EK_KESMELI = 6;
/**
 * Bitişik yazılan ek yalnız bilinen bir hâl eki olabilir (katlanmış hâlleriyle: yönelme, belirtme, bulunma, ayrılma, tamlayan, ile, -ki),
 * adın son harfine göre: ünsüzle biten ada "a, i, da, dan, in, la" ailesi; ünlüyle biten ada kaynaştırmalı "ya, yi, nin, yla" ve
 * tamlama sonrası "na, ni, nda, ndan" ailesi ("soru bankasına", "marka sitesinden").
 * Neden (güvenlik taraması 13 Kas B6): "en çok dört harf" ölçüsü "Kar" için karar, kart, kardeş; "Kasa" için kasap, kasaba; "Pazar" için
 * pazartesi; "Dur" için durum sayıyordu. Kesme işaretli ekte liste aranmaz (kesme niyeti gösterir). Ünsüz yumuşaması ("Merceğe") bu
 * listelerle eşleşmez; onun kuralı aşağıda ayrıdır (`yumusakGovde`).
 * Kalan yanlış eşleşme: ekle aynı yazılan başka kelime ("Kar" için kara, karı). Eşleştirme izin verir, iş göndermez.
 */
export const EKLER_UNSUZ = new Set(['a', 'e', 'i', 'u', 'da', 'de', 'ta', 'te', 'dan', 'den', 'tan', 'ten', 'in', 'un', 'la', 'le', 'daki', 'deki', 'taki', 'teki']);
export const EKLER_UNLU = new Set([
  'ya', 'ye', 'yi', 'yu', 'da', 'de', 'dan', 'den', 'nin', 'nun', 'yla', 'yle', 'daki', 'deki',
  'na', 'ne', 'ni', 'nu', 'nda', 'nde', 'ndan', 'nden',
]);
const UNLULER = new Set(['a', 'e', 'i', 'o', 'u']);

/**
 * ÜNSÜZ YUMUŞAMASI (0.1.29; sözleşme docs/sozlesme-unvanlar.md "Ek D2f"). Ünlüyle başlayan ek adın son ünsüzünü yumuşatır ("Rapor
 * Çekirdek" → "Rapor Çekirdeğe"): gövde harfi harfine tutmaz, ad eşleşmez; aynı yerde başlayan kısa ad ("Rapor") eşleşirdi. Bu yüzden
 * katlanmış adın YUMUŞAMIŞ GÖVDESİ ayrıca aranır: son harf k → g, p → b.
 * · ç → c için kural gerekmez: katlama ikisini aynı harfe indirir.
 * · t → d YOKTUR: ünlüyle biten bir adın bulunma hâliyle çakışır ("Konut" penceresi "bu konuda" ile anılmış sayılırdı).
 * · Adın son sözcüğü en az İKİ ünlü taşımalıdır: tek ünlülü sözcüklerin çoğu yumuşamaz ("küpe", "çarka"); aranırsa başka sözcükler
 *   ad sayılırdı ("Sevk" için "sevgi", "Kap" için "kaba"). Son sözcük = adın sonundaki kesintisiz harf / rakam dizisidir: boşluk
 *   gibi tire, eğik çizgi ve nokta da ayırır ("Ön-Kap"ın son sözcüğü "kap"tır; bağımsız okuma 19 Kas B3).
 * Kalan yanlış eşleşme: yumuşamış biçimle aynı yazılan başka kelime ("Arap" için "araba", "Gelecek" için "geleceği söyledi").
 * Eşleştirme izin verir, iş göndermez.
 */
const YUMUSAMA = new Map([['k', 'g'], ['p', 'b']]);
/** Yumuşamış gövdenin ardından gelebilen ekler: BİTİŞİK, KESMESİZ, yalnız bu altısı (yönelme, belirtme, tamlayan). Ek ŞARTTIR. */
export const EKLER_YUMUSAK = new Set(['a', 'e', 'i', 'u', 'in', 'un']);
/** Yumuşamış gövdenin ardında okunan en çok harf: en uzun ek iki harf; üçüncü harf görülünce eşleşme yoktur (süre sınırı). */
const EK_YUMUSAK_OKUMA = 3;

/**
 * Katlanmış adın yumuşamış gövdesi ("panel cekirdek" → "panel cekirdeg"); kural tutmuyorsa null.
 * @param {unknown} ad `katla`'dan geçmiş ad
 * @returns {string | null}
 */
export function yumusakGovde(ad) {
  if (typeof ad !== 'string' || ad.length === 0) return null;
  const yumusak = YUMUSAMA.get(ad.charAt(ad.length - 1));
  if (yumusak === undefined) return null;
  let unlu = 0;
  for (let i = ad.length - 1; i >= 0 && harfMi(ad.charAt(i)); i -= 1) if (UNLULER.has(ad.charAt(i))) unlu += 1;
  return unlu >= 2 ? ad.slice(0, -1) + yumusak : null;
}
/** Eşleştirmeye giren istem en çok bu kadar karakter; daha uzunu eşleştirilmez (söz hiçbir pencereye yetmez; süre sınırı). */
export const ISTEM_AZAMI = 262_144;
/** Sarmal bloklar atıldıktan sonra kalan metnin eşleştirilen bölümü (baştan). */
export const SOZ_METNI_AZAMI = 20_000;
/** Bir sarmal türünden işlenen en çok blok; fazlası metnin sonuna kadar atılır. */
export const SARMAL_BLOK_TAVANI = 50;
/** Bir adın metinde sayılan en çok geçişi. */
export const AD_GECIS_TAVANI = 50;
const KIMLIK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Türkçe harfler tek tek katlanır (yerel ayar verisine güvenilmez): İ, I, ı → i; ç → c; ğ → g; ö → o; ş → s; ü → u; şapkalılar yalın.
const HARF = new Map([
  ['İ', 'i'], ['I', 'i'], ['ı', 'i'], ['Ç', 'c'], ['ç', 'c'], ['Ğ', 'g'], ['ğ', 'g'], ['Ö', 'o'], ['ö', 'o'], ['Ş', 's'], ['ş', 's'],
  ['Ü', 'u'], ['ü', 'u'], ['Â', 'a'], ['â', 'a'], ['Î', 'i'], ['î', 'i'], ['Û', 'u'], ['û', 'u'],
]);
// "i" + birleşen üst nokta (bazı klavye ve dönüştürücülerin İ'nin küçüğü olarak ürettiği çift): nokta atılır. Kaynağa görünmez karakter
// yazılmaz; kod noktasından kurulur.
const UST_NOKTA = String.fromCharCode(0x307);
// Kesme işaretleri: düz, kıvrık, harf kesmesi, ters tırnak.
const KESMELER = new Set(["'", String.fromCharCode(0x2019), String.fromCharCode(0x2bc), '`', String.fromCharCode(0x2018)]);

const harfMi = (c) => /[\p{L}\p{N}]/u.test(c);
const boslukMu = (c) => /\s/.test(c);

/** Kıyas için katlama: Türkçe harfler yalın, küçük harf, ardışık boşluk tek boşluk, baş ve son boşluk yok. Dizge değilse ''. */
export function katla(metin) {
  if (typeof metin !== 'string') return '';
  let s = '';
  let oncekiBosluk = true;
  for (const c of metin) {
    if (c === UST_NOKTA) continue;
    if (boslukMu(c)) {
      if (!oncekiBosluk) s += ' ';
      oncekiBosluk = true;
      continue;
    }
    s += HARF.get(c) ?? c.toLowerCase();
    oncekiBosluk = false;
  }
  return s.endsWith(' ') ? s.slice(0, -1) : s;
}

/**
 * Sunucudan inen ad listesini doğrular ve kıyasa hazırlar: `[{ b, a, k }]` → `[{ b, adlar: [katlanmış ad, katlanmış kod adı] }]`.
 * Biçimsiz girdi, kimliği bozuk, adı kısa ya da çok uzun satır atılır; en çok 40 satır.
 *
 * BİLİNEN SINIR (güvenlik taraması 13 Kas B3): liste sunucudan gelir ve eşleşen satırların kimlikleri sunucuya döner. Sunucu kötü niyetli
 * ya da ele geçmişse listeye pencere adı yerine kelime koyup istemde o kelimelerin geçip geçmediğini öğrenebilir: istem başına en çok
 * 40 satır × 2 ad = 80 kelime ya da öbek sınanır, en çok 20 kimlik döner (liste sırasıyla; metindeki geçiş sırası DÖNMEZ). Liste yalnız
 * eklenti istediğinde kabul edilir (açılışta ve en çok 10 dakikada bir), sunucu her istemden önce yeni liste koyamaz. Metnin kendisi çıkmaz.
 */
export function adListesiHazirla(liste) {
  if (!Array.isArray(liste)) return [];
  const cikti = [];
  for (const s of liste) {
    if (cikti.length >= AD_LISTESI_TAVANI) break;
    if (!s || typeof s !== 'object' || typeof s.b !== 'string' || !KIMLIK.test(s.b)) continue;
    const adlar = [];
    for (const ham of [s.a, s.k]) {
      // Çok uzun ad kırpılmaz, ATILIR: kırpılmış ad başka bir şeyi eşleştirir.
      const ad = typeof ham === 'string' && ham.length <= AD_AZAMI * 2 ? katla(ham) : '';
      const uzunluk = Array.from(ad).length;
      if (uzunluk >= AD_ASGARI && uzunluk <= AD_AZAMI && !adlar.includes(ad)) adlar.push(ad);
    }
    if (adlar.length > 0) cikti.push({ b: s.b, adlar });
  }
  return cikti;
}

/** Ad listesinin depodaki anahtarı (oturum başına); oturum kimliği biçimsizse null. */
export function adListesiAnahtari(seansId) {
  if (typeof seansId !== 'string') return null;
  const ad = seansId.replace(/[^A-Za-z0-9_-]/g, '');
  return ad.length > 0 ? `vibento.adlar.${ad}` : null;
}

/**
 * Sunucunun yanıtındaki `ad_listesi`'nden depoya yazılacak kayıt; alan dizi değilse null (yanıtta liste yok: eski kayıt KALIR).
 * Boş dizi geçerlidir (klasörde anılabilecek başka pencere yok) ve eski listeyi SİLER.
 * @returns {{ liste: { b: string, adlar: string[] }[], zaman: number } | null}
 */
export function adKaydiKur(govdeListesi, simdiMs) {
  if (!Array.isArray(govdeListesi) || typeof simdiMs !== 'number' || !Number.isFinite(simdiMs)) return null;
  return { liste: adListesiHazirla(govdeListesi), zaman: simdiMs };
}

/**
 * Depodan okunan kayıt: biçimi tutuyorsa `{ liste, zaman }`, tutmuyorsa null. Liste yeniden doğrulanır (depo elle bozulmuş olabilir).
 * @returns {{ liste: { b: string, adlar: string[] }[], zaman: number } | null}
 */
export function adKaydiOku(deger) {
  if (!deger || typeof deger !== 'object' || !Array.isArray(deger.liste) || typeof deger.zaman !== 'number' || !Number.isFinite(deger.zaman)) return null;
  const liste = [];
  for (const s of deger.liste) {
    if (liste.length >= AD_LISTESI_TAVANI) break;
    if (!s || typeof s !== 'object' || typeof s.b !== 'string' || !KIMLIK.test(s.b) || !Array.isArray(s.adlar)) continue;
    const adlar = s.adlar
      .filter((a) => typeof a === 'string' && a.length <= AD_AZAMI * 2 && Array.from(a).length >= AD_ASGARI && Array.from(a).length <= AD_AZAMI && a === katla(a))
      .slice(0, 2);
    if (adlar.length > 0) liste.push({ b: s.b, adlar });
  }
  return { liste, zaman: deger.zaman };
}

/** Liste yok ya da ömrünü doldurduysa (saat geri gitmişse de) eklenti sunucudan yenisini ister. */
export function adListesiIstenirMi(kayit, simdiMs) {
  if (!kayit) return true;
  const yas = simdiMs - kayit.zaman;
  return !(yas >= 0 && yas <= AD_LISTESI_OMRU_MS);
}

/** `metin` içinde `bas` konumunda başlayan `ad` eşleşmesinin bittiği konum (ek dahil değil), eşleşme yoksa -1. Kelime başı şart. */
function eslesmeSonu(metin, ad, bas) {
  if (!metin.startsWith(ad, bas)) return -1;
  if (bas > 0 && harfMi(metin.charAt(bas - 1))) return -1;
  const son = bas + ad.length;
  if (son >= metin.length) return son;
  let p = son;
  const kesmeli = KESMELER.has(metin.charAt(p));
  if (kesmeli) p += 1;
  const ekBasi = p;
  let ek = 0;
  while (p < metin.length && harfMi(metin.charAt(p))) { p += 1; ek += 1; }
  // Ek yoksa ad tek başına geçmiştir (özne konumu); kesmeden sonra hiç harf yoksa kesme tırnaktır.
  if (ek === 0) return son;
  // Kesmeli ek: uzunluğu sınırlı. Bitişik ek: uzunluğu sınırlı VE bilinen bir hâl eki ("kasadan" evet; "kasaba", "kasap" hayır).
  if (kesmeli) return ek <= EK_KESMELI ? son : -1;
  if (ek > EK_BITISIK) return -1;
  const ekler = UNLULER.has(ad.charAt(ad.length - 1)) ? EKLER_UNLU : EKLER_UNSUZ;
  return ekler.has(metin.slice(ekBasi, p)) ? son : -1;
}

/**
 * `metin` içinde `bas` konumunda başlayan YUMUŞAMIŞ `govde` eşleşmesinin bittiği konum (ek dahil değil), eşleşme yoksa -1.
 * Kelime başı şart; gövdenin hemen ardından bitişik ve kesmesiz, `EKLER_YUMUSAK`'tan bir ek gelmeli (yalın yumuşak gövde ad değildir).
 * Dönen aralık adla aynı uzunluktadır: "aynı yerde en uzun ad" kuralına harfi harfine eşleşmelerle birlikte girer.
 */
function yumusakSonu(metin, govde, bas) {
  if (!metin.startsWith(govde, bas)) return -1;
  if (bas > 0 && harfMi(metin.charAt(bas - 1))) return -1;
  const son = bas + govde.length;
  let p = son;
  while (p < metin.length && harfMi(metin.charAt(p))) {
    p += 1;
    if (p - son >= EK_YUMUSAK_OKUMA) return -1;
  }
  return EKLER_YUMUSAK.has(metin.slice(son, p)) ? son : -1;
}

/**
 * İstem metninde anılan pencerelerin bölüm kimlikleri (LİSTE sırasıyla, tekrarsız, en çok 20). Metindeki geçiş sırası dönmez: sunucu
 * kimliklerden kelimelerin sırasını öğrenmesin (güvenlik taraması 13 Kas B3); karar için sıra gerekmez, yalnız "anıldı mı".
 * Kelime başında başlamalı; ardından kelime sonu, kesme işareti + ek ya da bilinen bir bitişik hâl eki gelebilir ("Video", "Video'ya",
 * "Kasadan"). Aynı yerde başlayan adlardan EN UZUNU sayılır ("Video Pro'ya" yalnız Video Pro'dur, Video değil); kısa ad başka yerde
 * ayrıca geçiyorsa sayılır. Ünsüz yumuşaması da eşleşir ("Bakır Merceğe", "Rapor Çekirdeği"): kuralı ve sınırı `yumusakGovde`'de.
 * @param {unknown} metin
 * @param {{ b: string, adlar: string[] }[]} liste `adListesiHazirla` çıktısı
 * @returns {string[]}
 */
export function anilanlariBul(metin, liste) {
  if (typeof metin !== 'string' || metin.length > ISTEM_AZAMI) return [];
  const m = katla(metin.length > SOZ_METNI_AZAMI ? metin.slice(0, SOZ_METNI_AZAMI) : metin);
  if (m.length === 0 || !Array.isArray(liste) || liste.length === 0) return [];
  const bulunan = [];
  for (const s of liste.slice(0, AD_LISTESI_TAVANI)) {
    for (const ad of s.adlar) {
      let p = m.indexOf(ad);
      let gecis = 0;
      while (p !== -1 && gecis < AD_GECIS_TAVANI) {
        gecis += 1;
        const son = eslesmeSonu(m, ad, p);
        if (son !== -1) bulunan.push({ bas: p, son, b: s.b });
        p = m.indexOf(ad, p + 1);
      }
      // Yumuşamış gövde (Ek D2f): ayrı geçiş sayacı; aralığı adla aynı uzunlukta, aşağıdaki "en uzun ad" seçimine birlikte girer.
      const govde = yumusakGovde(ad);
      if (govde === null) continue;
      let q = m.indexOf(govde);
      let yumusakGecis = 0;
      while (q !== -1 && yumusakGecis < AD_GECIS_TAVANI) {
        yumusakGecis += 1;
        const son = yumusakSonu(m, govde, q);
        if (son !== -1) bulunan.push({ bas: q, son, b: s.b, yumusak: true });
        q = m.indexOf(govde, q + 1);
      }
    }
  }
  // Uzun eşleşme önce; onun kapladığı aralıkta başlayan eşleşmeler düşer (soldan açgözlü seçim). Aynı yerde, aynı uzunlukta iki
  // eşleşmede HARFİ HARFİNE yazılan ad kazanır: bir adın yumuşamış gövdesi başka bir adın birebir yazımıysa ("Kitap" ve "Kitab";
  // "kitaba" yazan Kitab'ı yazmıştır) söz, yazılan ada yeter (bağımsız okuma 19 Kas B1; liste sırasına bağlı kalmaz).
  bulunan.sort((x, y) => (x.bas - y.bas) || ((y.son - y.bas) - (x.son - x.bas)) || ((x.yumusak ? 1 : 0) - (y.yumusak ? 1 : 0)));
  const anilan = new Set();
  let kapali = -1;
  for (const e of bulunan) {
    if (e.bas < kapali) continue;
    kapali = e.son;
    anilan.add(e.b);
  }
  const cikti = [];
  for (const s of liste) {
    if (cikti.length >= ANILAN_TAVANI) break;
    if (anilan.has(s.b) && !cikti.includes(s.b)) cikti.push(s.b);
  }
  return cikti;
}

// Toplu söz: "hepsine söyle", "herkese yaz", "bütün koordinatörlere", "tüm pencerelerden" … (katlanmış metinde aranır).
const TOPLU_TEK = ['hepsine', 'hepsinden', 'herkese', 'herkesten', 'tumune', 'tumunden', 'her birine', 'her birinden'];
const TOPLU_ON = ['butun', 'tum', 'her'];
// "ekib": "ekibe", "ekibine" (ünsüz yumuşaması).
const TOPLU_AD = ['koordinator', 'pencere', 'is bolum', 'ekip', 'ekib', 'bolum'];

/** İstemde toplu söz kalıbı geçiyor mu. Yalnız işarettir: izin vermez, pencereye "tek onayla sor" yolunu hatırlatır. */
export function topluSozMu(metin) {
  const m = katla(metin);
  if (m.length === 0) return false;
  const kelimeBasi = (p) => p === 0 || !harfMi(m.charAt(p - 1));
  const kelimeSonu = (p) => p >= m.length || !harfMi(m.charAt(p));
  for (const k of TOPLU_TEK) {
    let p = m.indexOf(k);
    while (p !== -1) {
      if (kelimeBasi(p) && kelimeSonu(p + k.length)) return true;
      p = m.indexOf(k, p + 1);
    }
  }
  for (const on of TOPLU_ON) {
    for (const ad of TOPLU_AD) {
      const kalip = `${on} ${ad}`;
      let p = m.indexOf(kalip);
      while (p !== -1) {
        if (kelimeBasi(p)) return true;
        p = m.indexOf(kalip, p + 1);
      }
    }
  }
  return false;
}

// Kullanıcının yazmadığı sarmal bloklar: içlerindeki ad kullanıcının sözü sayılmaz (yapıştırılan içerik, IDE ve tarayıcı bağlamı, sistem ve
// araç çıktıları). Kapanışı olmayan blok metnin sonuna kadar atılır (güvenli yön: eksik eşleşme onaya düşürür).
//
// Blok, açılışından o etiketin SON kapanışına kadar atılır (güvenlik taraması 13 Kas B1): içerik kendi kapanış etiketini taşıyabilir
// (yapıştırılan dosya, seçilen kod, açılan sayfa: "</ide_selection> Video'ya yaz") ve ilk kapanışta durmak arkasındaki metni kullanıcının
// sözü sayardı. Bedeli: aynı türden iki blok arasına kullanıcının yazdığı metin de atılır (eksik eşleşme, onaya düşer). Açılış özellik
// taşıyorsa (`<pasted_content id="…">`) önce AYNI özellikli son kapanış aranır: ayrı kimlikli iki yapıştırma arasındaki söz korunur.
// Listede olmayan bir sarmal türü tanınmaz (bilinen sınır): içeriği kullanıcının sözü gibi okunur.
const SARMALLAR = [
  'pasted_content', 'ide_opened_file', 'ide_selection', 'browser_instruction', 'system-reminder', 'task-notification',
  'local-command-stdout', 'local-command-stderr', 'local-command-caveat', 'bash-input', 'bash-stdout', 'bash-stderr',
  // `command-args` de listede (güvenlik taraması üçüncü tur Y5): yapıştırmayla BAŞLAYAN bir istemin içindeki komut etiketleri sözden
  // atılır (etiketli komut biçimi söz sayılmıyor; `sozMetni`'nin etiketli kolu yalnız istem komut etiketiyle başlıyorsa koşar).
  'user-prompt-submit-hook', 'scheduled-task', 'command-message', 'command-name', 'command-args',
];

/** `s` içinde `bas`'tan SONRA başlayan, `ad` etiketinin son kapanışı: `[başı, bittiği yer]`; yoksa `[-1, -1]`. */
function sonKapanis(s, ad, bas) {
  const kapanis = `</${ad}`;
  let k = s.lastIndexOf(kapanis);
  while (k > bas) {
    const c = s.charAt(k + kapanis.length);
    if (c === '>' || boslukMu(c)) {
      const son = s.indexOf('>', k);
      if (son !== -1) return [k, son + 1];
    }
    k = s.lastIndexOf(kapanis, k - 1);
  }
  return [-1, -1];
}

/** `s`'in [bas, son) aralığında listedeki herhangi bir sarmalın AÇILIŞI var mı. Yalnız o aralık taranır (süre aralıkla sınırlı). */
function acilisVar(s, bas, son) {
  if (son <= bas) return false;
  // Aralığın sonunda yarım kalan bir açılışın ardındaki karakter de görülsün diye bir karakter fazla alınır.
  const bolge = s.slice(bas, son + 1);
  for (const ad of SARMALLAR) {
    const acilis = `<${ad}`;
    let p = bolge.indexOf(acilis);
    while (p !== -1 && p < son - bas) {
      const c = bolge.charAt(p + acilis.length);
      if (c === '>' || c === '/' || boslukMu(c)) return true;
      p = bolge.indexOf(acilis, p + 1);
    }
  }
  return false;
}

/** `s`'te listedeki herhangi bir sarmalın KAPANIŞI kalmış mı (açılışı olmayan, yetim kapanış). */
function kapanisVar(s) {
  for (const ad of SARMALLAR) {
    const kapanis = `</${ad}`;
    let p = s.indexOf(kapanis);
    while (p !== -1) {
      const c = s.charAt(p + kapanis.length);
      if (c === '>' || boslukMu(c)) return true;
      p = s.indexOf(kapanis, p + 1);
    }
  }
  return false;
}

/**
 * Sarmal blokları atar; kalan metin kullanıcının kendi yazdığıdır. Sınırlar güvenilir değilse `null` döner (söz metni yok sayılır).
 * İKİ SIKI KONTROL (güvenlik taraması ikinci tur Y1, Y2): içerik kapanış etiketlerini taklit edebildiği için "son kapanış" tek başına
 * yetmiyordu: önce işlenen bir türün son kapanışı, SONRAKİ bir bloğun içindeki taklit olabiliyor (çapraz tür; ya da ikinci yapıştırmanın
 * içinde birincinin kimliğini tutturan kapanış) ve atma o bloğun açılışını yutup kalan içeriği söz bırakıyordu.
 *   ① Atılan bölgenin İÇİNDE listedeki herhangi bir sarmalın açılışı varsa → null. (Taklit kapanış başka bir bloğun içindeyse o bloğun
 *      açılışı bölgeye girer; iç içe blok da böyle yakalanır.)
 *   ② Bütün bloklar atıldıktan sonra metinde bir sarmal kapanışı kaldıysa → null.
 * Bedeli: sarmal etiketi içeren içerik yapıştırıldığında (ör. bir döküm) o istemde ad eşleşmez, onaya düşer.
 */
function sarmallariAt(metin) {
  let s = metin;
  for (const ad of SARMALLAR) {
    const acilis = `<${ad}`;
    let p = s.indexOf(acilis);
    let blok = 0;
    while (p !== -1) {
      const sonra = s.charAt(p + acilis.length);
      if (sonra !== '>' && !boslukMu(sonra) && sonra !== '/') { p = s.indexOf(acilis, p + 1); continue; }
      blok += 1;
      const etiketSonu = s.indexOf('>', p);
      // Açılış etiketi kapanmıyorsa ya da bu türden çok fazla blok varsa kalanı atılır.
      if (etiketSonu === -1 || blok > SARMAL_BLOK_TAVANI) { s = s.slice(0, p); break; }
      const ozellik = s.slice(p + acilis.length, etiketSonu).trim();
      let bas = -1;
      let son = -1;
      if (ozellik.length > 0 && ozellik !== '/') {
        const ayni = `</${ad} ${ozellik}>`;
        const k = s.lastIndexOf(ayni);
        if (k > etiketSonu) { bas = k; son = k + ayni.length; }
      }
      if (bas === -1) [bas, son] = sonKapanis(s, ad, etiketSonu);
      if (bas === -1) {
        // Kapanışı yok: kalan atılır. Kalanın içinde başka bir açılış olması sorun değildir (hepsi gidiyor).
        s = s.slice(0, p);
        break;
      }
      if (acilisVar(s, etiketSonu + 1, bas)) return null; // ①
      s = `${s.slice(0, p)} ${s.slice(son)}`;
      p = s.indexOf(acilis, p);
    }
  }
  return kapanisVar(s) ? null : s; // ②
}

/**
 * Ad eşleştirmesinin bakacağı metin = kullanıcının KENDİ yazdığı kısım.
 * · Etiketli komut biçimi (`<command-message>` / `<command-name>` ile başlar): yalnız `<command-args>…</command-args>` içi.
 * · Yalın eğik çizgili komut (`/komut metin`): komut adından sonraki metin.
 * · Öbür istemler: sarmal bloklar atıldıktan sonra kalan metin.
 * @param {unknown} prompt
 * @returns {string}
 */
export function sozMetni(prompt) {
  // Çok uzun istem eşleştirilmez (süre sınırı; söz hiçbir pencereye yetmez, onaya düşer).
  if (typeof prompt !== 'string' || prompt.length > ISTEM_AZAMI) return '';
  const kes = (m) => (m.length > SOZ_METNI_AZAMI ? m.slice(0, SOZ_METNI_AZAMI) : m);
  const s = prompt.trim();
  if (s.startsWith('<command-message') || s.startsWith('<command-name')) {
    const a = s.indexOf('<command-args>');
    if (a === -1) return '';
    // Komutun yanına yazılan metin: İLK kapanışa kadar (burada az metin almak sıkı yöndür; sarmal atmanın tersi).
    const k = s.indexOf('</command-args>', a);
    return kes(sarmallariAt(k === -1 ? s.slice(a + 14) : s.slice(a + 14, k)) ?? '');
  }
  // Sarmal sınırları güvenilir değilse (iç içe ya da çapraz etiket, yetim kapanış) söz metni yok sayılır.
  const ham = sarmallariAt(s);
  if (ham === null) return '';
  const yalin = ham.trim();
  if (yalin.startsWith('/')) {
    let p = 0;
    while (p < yalin.length && !boslukMu(yalin.charAt(p))) p += 1;
    return kes(yalin.slice(p));
  }
  return kes(yalin);
}

/** Etiketli komut biçimi mi (kullanıcının eğik çizgili komutu; DECISIONS 13 Kas: söz sayılır). */
export function etiketliKomutMu(prompt) {
  if (typeof prompt !== 'string') return false;
  const s = prompt.trim();
  return s.startsWith('<command-message>') || s.startsWith('<command-name>');
}

/**
 * İstemin `UserPromptSubmit` gövdesine ekleyeceği alanlar. Liste yoksa (sunucu henüz göndermedi) `anilanlar` BOŞ dizidir: söz hiçbir
 * pencereye yetmez, onaya düşer (sıkı yön). Metin dönmez.
 * @returns {{ anilanlar: string[], toplu_soz?: true }}
 */
export function sozAlanlari(prompt, liste) {
  const metin = sozMetni(prompt);
  const ek = { anilanlar: anilanlariBul(metin, Array.isArray(liste) ? liste : []) };
  if (topluSozMu(metin)) ek.toplu_soz = true;
  return ek;
}
