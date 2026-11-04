// =====================================================================
// eklenti/vibento/hooks/kart-mantik.mjs — pencere kartlarının saf mantığı (docs/sozlesme-pencere-kartlari.md).
//
// Yanıt metnini parçalara ayırır: düz metin, kart satırları (`**Pencere · Ajan · SORU · kimlik:** metin`), kapanış. Çizim kart.tsx'te; burada motor yok, atmaz.
// Kuşkuda null döner: satıra dokunulmaz, çünkü motora dokunan her satır eklenti çerçevesi alır.
// Değişmez: dolu hiçbir satır kaybolmaz. Katlanan yalnız bilinen, zararsız kapanış satırıdır; gerisi görünür kalır (tarama Ek 11 O2).
// =====================================================================

export const KART_DEPO_ANAHTARI = 'vibento.kart';
const KAYNAK_TAVANI = 100;
const AD_TAVANI = 200;
// Motor bir çizimde 100 000 karakter çizer ve kapanış en sonda; yaklaşan yanıta dokunulmaz, istek düşmesin (tarama Ek 11 D9).
const METIN_TAVANI = 90_000;
const KATLANAN_TAVAN = 300;

const ETIKET_SATIRI = /^\*\*([^*·\n]{1,200}?) · ([^*·\n]{1,120}?) · (SORU|ONAY İSTİYOR|BİLGİ)(?: · ([0-9a-f]{6}))?:\*\*[ \t]*(.*)$/u;
const SENDEN = /^\*\*Senden istediğim:\*\*[ \t]*(.*)$/u;
// "Senden istediğim" başka pencereden geliyorsa onun etiketiyle başlar (docs/sozlesme-pencere-kartlari.md karar 9).
// Model satırın içinde kalın işaretini bazen yazmıyor (4 Kas gerçek deneme): iki biçim de etikettir, doğrulama yine ad ve kimlikte.
const SORU_ETIKETI = /^(?:\*\*)?([^*·\n]{1,200}?) · ([^*·\n]{1,120}?) · (SORU|ONAY İSTİYOR|BİLGİ)(?: · ([0-9a-f]{6}))?:(?:\*\*)?[ \t]*/u;
const GORUNMEZ = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;
// Emojinin kendi birleştiricileri içerik saklamaz (5 Kas gerçek yanıt): yalnız geçerli emoji dizisinin içinde görünmez sayılmaz; art arda bağ ya da sonda bağ bilgi taşıyabilir, kapıda kalır (tarama Ek 21 D2).
const EMOJI_DIZISI = /\p{Extended_Pictographic}\p{Emoji_Modifier}?\uFE0F?(?:\u200D\p{Extended_Pictographic}\p{Emoji_Modifier}?\uFE0F?)*/gu;
const EMOJI_BAGI = /[\uFE0F\u200D]/gu;
const gorunmezVar = (s) => GORUNMEZ.test(s.replace(EMOJI_DIZISI, (d) => d.replace(EMOJI_BAGI, '')));
const GORUNMEZ_HEPSI = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
const SORU_YASAK = /[<>`~]/;
// Dosya adı çoğunlukla ters tırnakla yazılıyor (4 Kas gerçek yanıt). Satır içi çift içeriği gizlemez; içi yine denetlenir, çift olmayan tırnak yasak.
const TIRNAK_CIFTI = /`([^`\n]{1,200})`/g;
const tirnaksiz = (s) => s.replace(TIRNAK_CIFTI, '$1');
const soruYasakMi = (s) => SORU_YASAK.test(tirnaksiz(s));
// Türkçe ek apostrofla yazılıyor ("Google'u bekleyelim", 4 Kas gerçek yanıt).
const SECENEK_ETIKETI = /^[\p{L}\p{N} '\u2019-]{1,40}$/u;
const SECENEK_SATIRI = /^(.{1,400}?)\s*\[([^[\]]{1,300})\]\s*[.?!]?\s*$/u;
const NUMARA = /^\d{1,2}[.)]\s+/u;
// Basınca "7A9Z ret" giderse kanca onu onay kararı okur: etiket karar kalıbı taşımaz (tarama Ek 21 D5).
const ETIKET_KARAR = /^\S{4}\s+(?:onay|ret)(?:\s|$)/iu;
// Metinde harf yoksa düğmenin sorusu yoktur (tarama Ek 21 O1).
const EN_AZ_METIN = /\p{L}/u;

const EVET_HAYIR = /\bevet\s*(?:\/|ya da|veya)\s*hayır\s*[.?!]?\s*$/iu;
// Soru ile İz arasında yalnız bilinen Park satırı ayrılır (4 Kas gerçek yanıt). İzin listesi: serbest etikette asıl içerik düğmenin dışına kaçar (tarama Ek 18 O1).
const PARK_SATIRI = /^\*\*Park(?: \(konuşulacak\))?:\*\*/u;
const PARK_TAVANI = 3;
const SINIF_ADI = /ONAY|SORU|BİLGİ/u;
// & yalnız karakter kodu biçimindeyken yasak ("Kişiler & Jargonlar" düz yazıdır, &#63; soru işaretini saklar).
const ARA_YASAK = /&(?:#|[\p{L}\p{N}]+;?)|[\[\uFF3B\uFF3D\p{Zl}\p{Zp}]|evet|hay[ıI]r/iu;
const EN_COK_SORU = 6;
const EN_COK_SECENEK = 6;
const IZ = /^\*\*İz:\*\*/u;
const KAPANIS_BASI = /^(\*\*)?(Güven:|Kural hatırlatması:|Dayanak:|Hesap defteri:|Hatırlatma:|Beklerken:)/u;
const KOD_ACILIS = /^([ \t]*)(`{3,}|~{3,})([^`\n]*)$/;
const KOD_KAPANIS = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;
const KOD_KUTU_TAVANI = 200;
const SORU_SATIR_TAVANI = 400;
// Bunu geçen metin soru işareti taşımak zorunda: soru işaretsiz uzun metin emirdir, tek tıkla evet verilmez (tarama Ek 20 O1).
const UZUN_METIN = 200;
const ETIKET_ICI = /· (?:SORU|ONAY İSTİYOR|BİLGİ)(?: · [0-9a-f]{6})?:/u;
const SORU_ISARETI = /[?\uFF1F\u061F\uFE56\uFE16\u2047-\u2049\u037E\u055E\u1367\uA60F\u2753\u2754\u2E2E\u00BF]/g;
const KOD_TEMIZLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]|[^\P{Cc}\t\n]/gu;

/** Çit kapanıyor mu: aynı karakter, en az açılış kadar uzun. Kart ve kod kutusu aynı kuralı izler (tarama D1). */
const citKapanirMi = (satir, cit) => {
  const k = KOD_KAPANIS.exec(satir);
  return k !== null && k[1][0] === cit[0] && k[1].length >= cit.length;
};
const soruSayisi = (metin) => (metin.match(SORU_ISARETI) ?? []).length;

const anahtar = (ad) => String(ad).normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');

/** "yok", "yok; bitince sorarım" istek değil; soru işareti varsa istektir ("yok, ama çıkayım mı?"). */
const istekYok = (metin) => {
  const m = metin.trim();
  if (m.length === 0) return true;
  return /^yok(?:\b|[.;,:])/iu.test(m) && !m.includes('?');
};

/** Katlanabilir mi: yalnız içeriği bilinen kısa satırlar. Dolu Hesap defteri, dolu Hatırlatma, Beklerken ve sıra dışı Güven görünür kalır. */
function katlanirMi(satir) {
  const s = satir.trim();
  if (s.length > KATLANAN_TAVAN || s.includes('?')) return false;
  if (/^(\*\*)?Güven:(\*\*)?\s*%?\d{1,3}%?\s*$/u.test(s)) return true;
  if (/^(\*\*)?Dayanak:/u.test(s)) return true;
  if (/^(\*\*)?Kural hatırlatması:/u.test(s)) return true;
  if (/^\*\*(Hesap defteri|Hatırlatma):\*\*\s*yok\.?\s*$/iu.test(s)) return true;
  return false;
}

/**
 * Soruyu izleyen satırlarda sondan Park satırlarını ayırır: soruya karışınca düğme bütün soru için kapanıyordu.
 * Sorudaki kapılar burada da geçerli, uzunluk düzenli ifadelerden önce (tarama Ek 18 O3, O4). Soru ya da seçenek taşıyan satır ayrılmaz: ekrandaki soru sayısı düğmeyle tutsun (Ek 13 O1).
 * @param {string[]} satirlar
 * @returns {number} soruya kalan satır sayısı
 */
function araSatirKes(satirlar) {
  let kes = satirlar.length;
  let park = 0;
  for (let i = satirlar.length - 1; i >= 0; i -= 1) {
    const s = satirlar[i].trim();
    if (s === '') continue;
    if (park === PARK_TAVANI) break;
    if (s.length > SORU_SATIR_TAVANI || !PARK_SATIRI.test(s) || gorunmezVar(s) || soruYasakMi(s) || soruSayisi(s) > 0 || ARA_YASAK.test(s) || SINIF_ADI.test(s)) break;
    park += 1;
    kes = i;
  }
  return kes;
}

/**
 * Kapanış bloğunu ayırır. Blok ancak yanıtın sonunda, `**İz:**` son dolu satırken geçerlidir; yazılırken (akış) ya da biçim dışıysa null.
 * @param {string[]} satirlar
 * @returns {{ bas: number, soru: string, gorunur: string, ayrinti: string } | null} istek yoksa da null
 */
function kapanisBul(satirlar) {
  let son = satirlar.length - 1;
  while (son >= 0 && satirlar[son].trim() === '') son -= 1;
  if (son < 0 || !IZ.test(satirlar[son])) return null;
  let senden = -1;
  for (let i = son - 1; i >= 0; i -= 1) {
    if (SENDEN.test(satirlar[i])) { senden = i; break; }
  }
  if (senden < 0) return null;
  const ilk = SENDEN.exec(satirlar[senden])?.[1] ?? '';
  const ara = satirlar.slice(senden + 1, son);
  // Düğme kalan soruya çıkmıyorsa ayırmanın faydası yok, satır soruda kalır: istek kırmızıdan çıkmasın (tarama Ek 18 O6).
  const aday = araSatirKes(ara);
  const kisa = [ilk, ...ara.slice(0, aday)].join('\n').trim();
  const kisaEtiket = SORU_ETIKETI.exec(kisa);
  const kisaGovde = kisaEtiket && temizAd(kisaEtiket[1]) && temizAd(kisaEtiket[2]) ? kisa.slice(kisaEtiket[0].length).trim() : kisa;
  const kes = aday < ara.length && secenekCoz(kisaGovde) ? aday : ara.length;
  const soru = [ilk, ...ara.slice(0, kes)].join('\n').trim();
  // Eşitlik anahtarı ara satırı da görür: aynı soru başka ara satırla yeni sorudur (tarama Ek 18 O5).
  const tam = [ilk, ...ara].join('\n').trim();
  if (istekYok(soru)) return null;
  let bas = senden;
  for (let i = senden - 1; i >= 0; i -= 1) {
    if (satirlar[i].trim() === '') continue;
    if (!KAPANIS_BASI.test(satirlar[i])) break;
    bas = i;
  }
  const blok = satirlar.slice(bas, senden).filter((s) => s.trim() !== '');
  const gorunur = [...blok.filter((s) => !katlanirMi(s)), ...ara.slice(kes).filter((s) => s.trim() !== '')].join('\n');
  const ayrinti = [...blok.filter(katlanirMi), satirlar[son]].join('\n');
  const e = SORU_ETIKETI.exec(soru);
  const pencere = e ? temizAd(e[1]) : '';
  const ajan = e ? temizAd(e[2]) : '';
  const govdeSoru = e ? soru.slice(e[0].length).trim() : soru;
  if (e && pencere && ajan && govdeSoru) {
    return { bas, soru: govdeSoru, tam, gorunur, ayrinti, kaynak: { pencere, ajan, etiket: e[3], kimlik: e[4] ?? null } };
  }
  return { bas, soru, tam, gorunur, ayrinti, kaynak: null };
}

/**
 * Sorudan düğmeler. Düğme yalnız açık biçimde çıkar, tahmin edilmez; kuşkuda null, cevap yazılır (tarama Ek 12).
 * Tek satır `... evet/hayır`; ya da her soru kendi satırında `[A | B]` tek seçim, `[A + B]` çoklu seçim. En çok bir giriş satırı.
 * Etiket kişinin sözü olarak gideceği için kısa ve düz yazı olmak zorunda. Görünmez karakter ya da biçimlendirme taşıyan soruda düğme yok: görünen ile okunan ayrılmasın.
 * @param {unknown} soru
 * Numaralı karışık soruda biçim dışı satır düğmesiz kalır (`secenekler` boş), öbürleri numarasıyla düğme alır; en az bir düğmeli satır gerekir (5 Kas gerçek yanıt: dışa dokunan adım düz sorulurken yanındaki seçim de düğmesiz kalıyordu).
 * @returns {{ metin: string, secenekler: string[], coklu: boolean }[] | null}
 */
export function secenekCoz(soru) {
  if (typeof soru !== 'string' || soru.length === 0) return null;
  const satirlar = soru.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
  if (satirlar.some((s) => s.length > SORU_SATIR_TAVANI || gorunmezVar(s) || soruYasakMi(s))) return null;
  // Ters tırnak düz çizilir: numara, pencere etiketi ve evet/hayır tırnak ardına saklanıp kapılardan geçmesin (tarama Ek 18 ek tur N1-N3).
  const duzSatirlar = satirlar.map(tirnaksiz);
  if (duzSatirlar.some((s, i) => SORU_ETIKETI.test(s) || ETIKET_ICI.test(s) || (/^\d{1,2}[.)]\s/.test(s) && !/^\d{1,2}[.)]\s/.test(satirlar[i])))) return null;
  if (satirlar.length === 1 && EVET_HAYIR.test(satirlar[0]) && !/^\d{1,2}[.)]\s/.test(satirlar[0])) {
    const metin = satirlar[0].replace(EVET_HAYIR, '').trim();
    if (metin.length === 0 || soruSayisi(metin) > 1 || (metin.length > UZUN_METIN && soruSayisi(metin) === 0)) return null;
    return [{ metin, secenekler: ['Evet', 'Hayır'], coklu: false }];
  }
  const govde = satirlar.length > 1 && !SECENEK_SATIRI.test(satirlar[0]) && !/^\d{1,2}[.)]\s/.test(satirlar[0]) ? satirlar.slice(1) : satirlar;
  if (govde.length === 0 || govde.length > EN_COK_SORU) return null;
  // Atılan giriş satırı soru taşıyorsa ekrandaki soru sayısı düğmeyle tutmaz: tek tık başka soruya evet sayılabilir (tarama O1).
  if (govde.length < satirlar.length && (soruSayisi(satirlar[0]) > 0 || satirlar[0].includes('[') || EVET_HAYIR.test(duzSatirlar[0]))) return null;
  // Düğme satırı 1, 2 diye gider: yazılı numara başka olursa cevap yanlış soruya okunur (tarama O2).
  const numaralar = govde.map((s) => /^(\d{1,2})[.)]\s+/u.exec(s));
  if (numaralar.some((n) => n !== null) && numaralar.some((n, i) => n === null || Number(n[1]) !== i + 1)) return null;
  const sorular = [];
  for (const [i, s] of govde.entries()) {
    // Numaralı satırda evet/hayır da sorudur (4 Kas gerçek yanıt: "2. ... evet/hayır" bütün soruyu düğmesiz bırakmıştı).
    const numara = numaralar[i];
    if (numara && EVET_HAYIR.test(s)) {
      const metin = s.slice(numara[0].length).replace(EVET_HAYIR, '').trim();
      if (metin.length === 0 || soruSayisi(metin) > 1 || (metin.length > UZUN_METIN && soruSayisi(metin) === 0)) return null;
      sorular.push({ metin, secenekler: ['Evet', 'Hayır'], coklu: false });
      continue;
    }
    const e = SECENEK_SATIRI.exec(numara ? s.slice(numara[0].length) : s);
    const coklu = e ? e[2].includes(' + ') : false;
    const secenekler = e ? e[2].split(coklu ? ' + ' : ' | ').map((x) => x.trim()) : [];
    const gecerli = e !== null && EN_AZ_METIN.test(e[1]) && soruSayisi(e[1]) <= 1 && !(e[1].length > UZUN_METIN && soruSayisi(e[1]) === 0)
      && secenekler.length >= 2 && secenekler.length <= EN_COK_SECENEK && secenekler.every((x) => SECENEK_ETIKETI.test(x) && !ETIKET_KARAR.test(x))
      && new Set(secenekler.map(anahtar)).size === secenekler.length;
    if (gecerli) { sorular.push({ metin: e[1].trim(), secenekler, coklu }); continue; }
    // Yalnız numaralı listede: satır yazı olarak kalır, numarası korunur. Uzun satır emir sayılır, liste düğme almaz (tarama Ek 21 O1).
    if (!numara || s.length - numara[0].length > UZUN_METIN) return null;
    sorular.push({ metin: s.slice(numara[0].length).trim(), secenekler: [], coklu: false });
  }
  const dugmeli = sorular.filter((q) => q.secenekler.length > 0);
  if (dugmeli.length === 0) return null;
  // Yanında düz satır varsa düğme kendi sorusunu taşımalı: düğme düz satırın cevabı sanılmasın (tarama Ek 21 O1).
  if (dugmeli.length < sorular.length && dugmeli.some((q) => soruSayisi(q.metin) === 0)) return null;
  return sorular;
}

/**
 * Düğmeler çizilince soru satır satır çizilir; `secenekCoz`un atladığı giriş satırı burada kalır, dolu hiçbir satır kaybolmaz.
 * @param {unknown} soru
 * @param {unknown[] | null} sorular
 * @returns {string}
 */
export function soruGirisi(soru, sorular) {
  if (!sorular) return '';
  const satirlar = String(soru ?? '').split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
  return satirlar.length > sorular.length ? satirlar[0] : '';
}

/**
 * Düğmeyle giden metin: yalnız seçim. Soru metni gitmez, model onu zaten biliyor; soru kişinin sözü olarak geri dönerse başka pencerenin yazdığı talimat kişinin sözü olurdu (tarama Ek 12 Y1).
 * @param {string[][]} secimler soru başına seçilen etiketler
 * @returns {string}
 */
export function cevapMetni(secimler) {
  if (secimler.length === 1) return `${secimler[0].join(', ')}.`;
  // Düğmesiz satırın seçimi boş: yazılmaz, öbürlerinin numarası kaymaz.
  return `${secimler.flatMap((s, i) => (s.length > 0 ? [`${i + 1}: ${s.join(', ')}`] : [])).join('; ')}.`;
}

/** Tek soru ve tek seçimde basınca hemen gider; gerisi işaretlenir, "Gönder"le gider. */
/**
 * Düğme bu kartta çıkar mı. Yalnız son yanıt (`sonSoru`: Stop yazar, yeni istem siler; yeniden yüklemede boş). Başka pencereden geliyorsa doğrulanmış olmalı ve onay istemi olmamalı:
 * onay yalnız sitede. Mesaj gelen turda etiketsiz soruya düğme yok: pencere mesajı kendi sorusu gibi görünmesin (tarama Ek 12 Y2).
 * @param {{ tam: string, kaynak: { etiket: string } | null }} kapanis ara satırı da gören eşitlik anahtarı `tam`: sonSoru ve açık soru onu tutar
 * @param {{ dogrulandi: boolean } | null} kaynakBilgi
 * @param {string} sonSoru
 * @param {boolean} mesajliTur
 * @param {string} [acikSoru] mesaj geldiği anda açık olan, kişinin turunda sorulmuş soru: model aynen yineleyince düğme kalır (4 Kas gerçek deneme, tarama Ek 16 Y1)
 * @returns {boolean}
 */
export function dugmeIzni(kapanis, kaynakBilgi, sonSoru, mesajliTur, acikSoru = '') {
  if (!sonSoru || sonSoru !== kapanis.tam) return false;
  if (kapanis.kaynak) return kaynakBilgi?.dogrulandi === true && kapanis.kaynak.etiket !== 'ONAY İSTİYOR';
  return !mesajliTur || (acikSoru !== '' && acikSoru === kapanis.tam);
}

export const NEDEN_BICIM = 'Düğme biçiminde değil; yazarak cevapla.';
// "Yeniden sordur" denmez: soru kişinin turuna geçince kaynak işareti kaybolur, koruma kişinin eliyle kalkar (tarama Ek 20 D2).
export const NEDEN_MESAJ = 'Bu turda başka pencereden mesaj geldi, düğme yok; yazarak cevapla.';
// "Yazarak cevapla" denmez: kaynağı belli olmayan isteğe cevabı ürünün sesiyle önermek olur (tarama Ek 20 O2).
export const NEDEN_KISMI = 'Düğme yalnız kendi satırına; düğmesiz satırı yazarak cevapla.';
export const NEDEN_KAYNAK = 'Kaynak doğrulanamadı: bunu kimin yazdığı belli değil, düğme yok.';

/**
 * Düğme neden yok: kart söylemezse aynı pencerede rastgele görünür (4 Kas gerçek kullanım). Yalnız son yanıtta; eski satır ve akış sessiz.
 * Onay isteğinin kendi satırı var, burada söylenmez.
 * @param {{ tam: string, sorular: { secenekler?: string[] }[] | null, kaynak: { etiket: string } | null }} kapanis
 * @param {{ dogrulandi: boolean } | null} kaynakBilgi
 * @param {string} sonSoru
 * @param {boolean} mesajliTur
 * @param {string} [acikSoru]
 * @returns {string | null}
 */
export function dugmeYokNedeni(kapanis, kaynakBilgi, sonSoru, mesajliTur, acikSoru = '') {
  if (!sonSoru || sonSoru !== kapanis.tam) return null;
  if (kapanis.kaynak) {
    if (kapanis.kaynak.etiket === 'ONAY İSTİYOR' || kapanis.kaynak.etiket === 'BİLGİ') return null;
    if (kaynakBilgi?.dogrulandi !== true) return NEDEN_KAYNAK;
  } else if (mesajliTur && (acikSoru === '' || acikSoru !== kapanis.tam)) {
    // Biçimden önce: mesajlı turda asıl uyarı budur (tarama Ek 20 D1).
    return NEDEN_MESAJ;
  }
  if (!kapanis.sorular) return NEDEN_BICIM;
  return kapanis.sorular.some((q) => q.secenekler?.length === 0) ? NEDEN_KISMI : null;
}

/**
 * Stop'ta açık soru. Liste değil tek soru: eski bir metni yazdırarak düğme alınmasın (tarama Ek 16 Y1). Kişinin yeni istemi de siler (register).
 * Mesajlı turda başka soru açığı kapatır; mesajlı turun sorusu kişinin turunda yinelense de açık olmaz (Ek 16 O1).
 * @param {{ acikSoru?: string, soruMesajli?: string }} durum
 * @param {string} soru bu yanıtın etiketsiz kapanış sorusu, yoksa boş
 * @param {boolean} mesajli
 * @returns {{ acikSoru: string, soruMesajli: string }}
 */
export function acikSoruGuncelle(durum, soru, mesajli) {
  const acikSoru = durum?.acikSoru ?? '';
  const soruMesajli = durum?.soruMesajli ?? '';
  // Sorusuz biten mesajlı tur açık soruyu kapatmaz: kişi hâlâ o soruyu bekliyor, yeni bir şey sorulmadı (Ek 16 N4).
  if (mesajli) return !soru || soru === acikSoru ? { acikSoru, soruMesajli } : { acikSoru: '', soruMesajli: soru };
  return { acikSoru: soru && soru !== soruMesajli ? soru : '', soruMesajli };
}

/** Son yanıttaki kartı tanır: eski yanıtın düğmesi kalkar (Stop yazar, yeni istem siler). */
export const kartAnahtari = (p) => `${p.kimlik ?? ''}|${p.metin}`;

/**
 * @param {{ parcalar?: any[] } | null | undefined} plan
 * @returns {string[]}
 */
export function sonKartlarOku(plan) {
  return (plan?.parcalar ?? []).filter((p) => p.tur === 'kart' && p.etiket === 'SORU').map(kartAnahtari);
}

/**
 * Pencere kartında düğme: yalnız SORU, sunucunun teslim ettiği kaynakla eşleşen, son yanıttaki, tek sorulu kart.
 * ONAY İSTİYOR düğme almaz: onay isteyen pencere yalnız kendi talebinin kararını ya da kendi sohbetindeki sözü kabul eder.
 * @param {any} p
 * @param {{ dogrulandi?: boolean } | null | undefined} kaynakBilgi
 * @param {unknown} sonKartlar
 * @returns {boolean}
 */
export function kartDugmeIzni(p, kaynakBilgi, sonKartlar) {
  if (p.etiket !== 'SORU' || kaynakBilgi?.dogrulandi !== true) return false;
  if (!Array.isArray(p.sorular) || p.sorular.length !== 1 || !p.kimlik) return false;
  return Array.isArray(sonKartlar) && sonKartlar.includes(kartAnahtari(p));
}

/**
 * Kart ve kapanış cevapları tek mesajda. Yalnız kimlik ve seçim gider: soru metni de pencere adı da kişinin sözü olmaz, ad serbest metindir (tarama Ek 12 Y1, Ek 14 Y1).
 * @param {{ kimlik: string, secim: string[] }[]} kartlar
 * @param {string[][] | null} kapanis
 * @param {string | null} [kapanisKimlik] kapanış başka pencerenin sorusuysa onun kimliği
 * @returns {string}
 */
export function toplamCevap(kartlar, kapanis, kapanisKimlik = null) {
  if (kartlar.length === 0) return cevapMetni(kapanis ?? []);
  const parca = kartlar.map((k) => `${k.kimlik}: ${k.secim.join(', ')}`);
  if (kapanis && kapanis.length > 0) parca.push(`${kapanisKimlik ?? 'Bu pencere'}: ${cevapMetni(kapanis).replace(/\.$/, '')}`);
  return `${parca.join('; ')}.`;
}

/** Düz çizilen satırı saran kalın işareti ve satır içi ters tırnak çiftini atar; satır içindeki yıldızlara dokunmaz. */
export const duzMetin = (metin) => String(metin ?? '').replace(/^\*\*(.+)\*\*$/u, '$1').replace(TIRNAK_CIFTI, '$1');

/** Karta çizilen soruda görünmez ve yön karakteri kalmaz: görünen, okunanla aynı olsun. */
export const temizGoster = (metin) => String(metin ?? '').replace(GORUNMEZ_HEPSI, '');

/**
 * Metin parçasını yazı ve kod kutularına ayırır. Kartlı yanıtta Markdown kod bloğunda kopyalama ve kayma yok (4 Kas ölçümü), kutuyu kart çizer.
 * Kapanmamış ya da boş çit yazı kalır. Görünmez karakter ve denetim karakteri düşer: görünen ile kopyalanan aynı olsun.
 * @param {string} metin
 * @returns {({ tur: 'yazi', metin: string } | { tur: 'kod', kaynak: string, dil: string })[]}
 */
export function metinBol(metin) {
  const satirlar = String(metin ?? '').split('\n');
  /** @type {any[]} */
  const cikti = [];
  let yazi = [];
  let kutu = 0;
  // Kapanmayan çit bir kez aranır: aynı karakterde en az o kadar uzun çit de kapanmaz, tarama karesel olmaz (tarama O3).
  /** @type {Record<string, number>} */
  const kapanmayan = {};
  const yaziBosalt = () => {
    const m = yazi.join('\n').trimEnd().replace(/^\n+/, '');
    if (m) cikti.push({ tur: 'yazi', metin: m });
    yazi = [];
  };
  for (let i = 0; i < satirlar.length; i++) {
    const ac = KOD_ACILIS.exec(satirlar[i]);
    if (!ac || kutu >= KOD_KUTU_TAVANI) { yazi.push(satirlar[i]); continue; }
    const [, girinti, cit, dil] = ac;
    if (cit.length >= (kapanmayan[cit[0]] ?? Infinity)) { yazi.push(satirlar[i]); continue; }
    let son = -1;
    for (let j = i + 1; j < satirlar.length; j++) {
      if (citKapanirMi(satirlar[j], cit)) { son = j; break; }
    }
    if (son < 0) { kapanmayan[cit[0]] = cit.length; yazi.push(satirlar[i]); continue; }
    const kaynak = satirlar.slice(i + 1, son)
      .map((s) => {
        // Yalnız çitin girintisi kadar boşluk gider; satırın kendi girintisi kalır (tarama D2).
        let n = 0;
        while (n < girinti.length && (s[n] === ' ' || s[n] === '\t')) n += 1;
        return s.slice(n);
      })
      .join('\n')
      .replace(KOD_TEMIZLE, '');
    if (kaynak.trim().length === 0) { yazi.push(...satirlar.slice(i, son + 1)); i = son; continue; }
    yaziBosalt();
    kutu += 1;
    cikti.push({ tur: 'kod', kaynak, dil: dil.trim() });
    i = son;
  }
  yaziBosalt();
  return cikti;
}

/**
 * Bant rengi kırmızıya yakınsa açılır: kırmızı "senden bir şey isteniyor" demek, iş rengi onunla karışmasın (4 Kas gerçek deneme).
 * Yalnız kartta; sitedeki iş rengi değişmez.
 * @template T
 * @param {T} renk
 * @returns {T | string}
 */
export function bantRengi(renk) {
  const e = typeof renk === 'string' ? /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(renk) : null;
  if (!e) return renk;
  const [k, y, m] = [e[1], e[2], e[3]].map((x) => parseInt(x, 16));
  const ust = Math.max(k, y, m);
  const fark = ust - Math.min(k, y, m);
  if (ust !== k || fark === 0) return renk;
  const ton = (60 * ((y - m) / fark) + 360) % 360;
  if (ton > 15 && ton < 320) return renk;
  const ac = (d) => Math.round(d + (255 - d) * 0.45).toString(16).padStart(2, '0');
  return `#${ac(k)}${ac(y)}${ac(m)}`.toUpperCase();
}

/** Ajan adı pencere adının son parçasıyla aynıysa iki kez yazılmaz. */
export function ajanGoster(pencere, ajan) {
  const son = String(pencere).split(/ › | \/ /).pop();
  return anahtar(son) === anahtar(ajan) ? null : ajan;
}

const temizAd = (ad) => ad.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();

/**
 * Yanıt metni → çizim planı. Çizilecek bir şey yoksa null: satıra dokunulmaz.
 * @param {unknown} metin
 * @returns {{ parcalar: ({ tur: 'metin', metin: string } | { tur: 'kart', pencere: string, ajan: string, etiket: 'SORU' | 'ONAY İSTİYOR' | 'BİLGİ', kimlik: string | null, metin: string, sorular: { metin: string, secenekler: string[], coklu: boolean }[] | null })[], kapanis: { soru: string, tam: string, gorunur: string, ayrinti: string, kaynak: { pencere: string, ajan: string, etiket: 'SORU' | 'ONAY İSTİYOR' | 'BİLGİ', kimlik: string | null } | null, sorular: { metin: string, secenekler: string[], coklu: boolean }[] | null } | null } | null}
 */
export function kartPlani(metin) {
  if (typeof metin !== 'string' || metin.length === 0 || metin.length > METIN_TAVANI) return null;
  const satirlar = metin.replace(/\r\n/g, '\n').split('\n');
  const k = kapanisBul(satirlar);
  const govde = k ? satirlar.slice(0, k.bas) : satirlar;
  /** @type {any[]} */
  const parcalar = [];
  let birikim = [];
  let kartVar = false;
  /** @type {string | null} */
  let cit = null;
  const bosalt = () => {
    const m = birikim.join('\n').trimEnd().replace(/^\n+/, '');
    if (m) parcalar.push({ tur: 'metin', metin: m });
    birikim = [];
  };
  for (const s of govde) {
    if (cit !== null) {
      if (citKapanirMi(s, cit)) cit = null;
      birikim.push(s);
      continue;
    }
    const ac = KOD_ACILIS.exec(s);
    if (ac) { cit = ac[2]; birikim.push(s); continue; }
    const e = ETIKET_SATIRI.exec(s);
    const pencere = e ? temizAd(e[1]) : '';
    const ajan = e ? temizAd(e[2]) : '';
    if (!e || !pencere || !ajan) { birikim.push(s); continue; }
    bosalt();
    kartVar = true;
    const kartMetni = e[5].trim();
    parcalar.push({ tur: 'kart', pencere, ajan, etiket: e[3], kimlik: e[4] ?? null, metin: kartMetni, sorular: e[3] === 'SORU' ? secenekCoz(kartMetni) : null });
  }
  bosalt();
  if (!kartVar && !k) return null;
  // Aynı kimlik birden çok yerdeyse cevap hangi soruya ait ayrışmaz, onay sınırı da dolanılır: düğme yok (tarama Ek 14 O1).
  /** @type {Map<string, number>} */
  const kimlikSayisi = new Map();
  const say = (kimlik) => { if (kimlik) kimlikSayisi.set(kimlik, (kimlikSayisi.get(kimlik) ?? 0) + 1); };
  for (const p of parcalar) if (p.tur === 'kart') say(p.kimlik);
  say(k?.kaynak?.kimlik);
  const tekrar = (kimlik) => Boolean(kimlik) && (kimlikSayisi.get(kimlik) ?? 0) > 1;
  for (const p of parcalar) if (p.tur === 'kart' && tekrar(p.kimlik)) p.sorular = null;
  return { parcalar, kapanis: k ? { soru: k.soru, tam: k.tam, gorunur: k.gorunur, ayrinti: k.ayrinti, kaynak: k.kaynak, sorular: tekrar(k.kaynak?.kimlik) ? null : secenekCoz(k.soru) } : null };
}

const renkGecerli = (r) => typeof r === 'string' && /^#[0-9A-Fa-f]{6}$/.test(r);

/**
 * Etiket sunucunun bu pencereye teslim ettiği bir mesaja mı ait: ad ve kimlik birlikte eşleşmeli (tarama Ek 11 O3).
 * Sahte etiket gerçek pencerenin rengini ve kırmızısını alamaz; başka mesajın kimliğini kopyalasa da ad tutmaz.
 * @param {unknown} kaynaklar
 * @param {string} pencere
 * @param {string | null} kimlik
 * @param {string} [ajan]
 * @returns {{ dogrulandi: boolean, renk: string | null }}
 */
export function kaynakBul(kaynaklar, pencere, kimlik, ajan) {
  if (!Array.isArray(kaynaklar) || !kimlik) return { dogrulandi: false, renk: null };
  const a = anahtar(pencere);
  for (const k of kaynaklar) {
    if (k && k.kimlik === kimlik && typeof k.ad === 'string' && anahtar(k.ad) === a && (typeof k.ajan !== 'string' || ajan === undefined || anahtar(k.ajan) === anahtar(ajan))) {
      return { dogrulandi: true, renk: renkGecerli(k.renk) ? k.renk : null };
    }
  }
  return { dogrulandi: false, renk: null };
}

/**
 * Sunucu yanıtından depoya yazılacak yeni durum; değişiklik yoksa null (her istemde depo yazılmasın). Başka bağlantının kaydı taşınmaz (tarama Ek 11 D12).
 * @param {unknown} eski
 * @param {unknown} govde
 * @param {string | null | undefined} baglantiId
 * @returns {{ baglanti_id: string | null, acik: boolean, kaynaklar: { ad: string, kimlik: string, renk: string | null, ajan?: string }[] } | null}
 */
export function kartDurumu(eski, govde, baglantiId) {
  if (!govde || typeof govde !== 'object') return null;
  const id = typeof baglantiId === 'string' ? baglantiId : null;
  const e = eski && typeof eski === 'object' ? eski : {};
  const ayni = e.baglanti_id === id;
  const eskiAcik = ayni && e.acik === true;
  const eskiKaynak = ayni && Array.isArray(e.kaynaklar) ? e.kaynaklar : [];
  const gelenOnay = Number.isInteger(govde.kart_onay_bekleyen) && govde.kart_onay_bekleyen >= 0 ? govde.kart_onay_bekleyen : undefined;
  // Sunucu sayıyı denedi ama okuyamadıysa (kart_acik true, sayı yok) eski değerle kesin konuşulmaz (tarama Ek 17 O4).
  const onayBekleyen = gelenOnay ?? (ayni && govde.kart_acik !== true && Number.isInteger(e.onay_bekleyen) ? e.onay_bekleyen : undefined);
  const alanVar = typeof govde.kart_acik === 'boolean' || Array.isArray(govde.kart_kaynaklari);
  if (!alanVar) return null;
  const acik = typeof govde.kart_acik === 'boolean' ? govde.kart_acik : eskiAcik;
  const gelen = (Array.isArray(govde.kart_kaynaklari) ? govde.kart_kaynaklari : [])
    .filter((k) => k && typeof k.ad === 'string' && k.ad.length > 0 && k.ad.length <= AD_TAVANI && typeof k.kimlik === 'string' && /^[0-9a-f]{6}$/.test(k.kimlik))
    .map((k) => ({ ad: k.ad, kimlik: k.kimlik, renk: renkGecerli(k.renk) ? k.renk : null, ...(typeof k.ajan === 'string' ? { ajan: k.ajan } : {}) }));
  const yeni = new Set(gelen.map((k) => k.kimlik));
  const kaynaklar = [...gelen, ...eskiKaynak.filter((k) => k && !yeni.has(k.kimlik))].slice(0, KAYNAK_TAVANI);
  if (ayni && acik === eskiAcik && onayBekleyen === e.onay_bekleyen && JSON.stringify(kaynaklar) === JSON.stringify(eskiKaynak)) return null;
  return { baglanti_id: id, acik, kaynaklar, ...(onayBekleyen === undefined ? {} : { onay_bekleyen: onayBekleyen }) };
}

/**
 * Bu pencerenin kimliği (yalnız çok bölümlü işte ya da koordinatörde sunucu gönderir): kapanış kartının başlığı. Biçim dışıysa null.
 * @param {unknown} govde
 * @returns {{ ad: string, ajan: string | null, renk: string | null } | null}
 */
export function kartPencereOku(govde) {
  const k = govde && typeof govde === 'object' ? govde.kart_pencere : null;
  if (!k || typeof k !== 'object' || typeof k.ad !== 'string' || k.ad.length === 0 || k.ad.length > AD_TAVANI) return null;
  return { ad: temizAd(k.ad), ajan: typeof k.ajan === 'string' && k.ajan ? temizAd(k.ajan) : null, renk: renkGecerli(k.renk) ? k.renk : null };
}
