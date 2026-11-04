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
const GORUNMEZ_HEPSI = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
const SORU_YASAK = /[<>`~]/;
const SECENEK_ETIKETI = /^[\p{L}\p{N} -]{1,40}$/u;
const SECENEK_SATIRI = /^(?:\d{1,2}[.)]\s+)?(.{1,200}?)\s*\[([^[\]]{1,300})\]\s*[.?!]?\s*$/u;
const EVET_HAYIR = /\bevet\s*(?:\/|ya da|veya)\s*hayır\s*[.?!]?\s*$/iu;
const EN_COK_SORU = 6;
const EN_COK_SECENEK = 6;
const IZ = /^\*\*İz:\*\*/u;
const KAPANIS_BASI = /^(\*\*)?(Güven:|Kural hatırlatması:|Dayanak:|Hesap defteri:|Hatırlatma:|Beklerken:)/u;
const KOD_ACILIS = /^([ \t]*)(`{3,}|~{3,})([^`\n]*)$/;
const KOD_KAPANIS = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;
const KOD_KUTU_TAVANI = 200;
const SORU_SATIR_TAVANI = 400;
const SORU_ISARETI = /[?\uFF1F\u061F]/g;
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
  const soru = [ilk, ...satirlar.slice(senden + 1, son)].join('\n').trim();
  if (istekYok(soru)) return null;
  let bas = senden;
  for (let i = senden - 1; i >= 0; i -= 1) {
    if (satirlar[i].trim() === '') continue;
    if (!KAPANIS_BASI.test(satirlar[i])) break;
    bas = i;
  }
  const blok = satirlar.slice(bas, senden).filter((s) => s.trim() !== '');
  const gorunur = blok.filter((s) => !katlanirMi(s)).join('\n');
  const ayrinti = [...blok.filter(katlanirMi), satirlar[son]].join('\n');
  const e = SORU_ETIKETI.exec(soru);
  const pencere = e ? temizAd(e[1]) : '';
  const ajan = e ? temizAd(e[2]) : '';
  const govdeSoru = e ? soru.slice(e[0].length).trim() : soru;
  if (e && pencere && ajan && govdeSoru) {
    return { bas, soru: govdeSoru, gorunur, ayrinti, kaynak: { pencere, ajan, etiket: e[3], kimlik: e[4] ?? null } };
  }
  return { bas, soru, gorunur, ayrinti, kaynak: null };
}

/**
 * Sorudan düğmeler. Düğme yalnız açık biçimde çıkar, tahmin edilmez; kuşkuda null, cevap yazılır (tarama Ek 12).
 * Tek satır `... evet/hayır`; ya da her soru kendi satırında `[A | B]` tek seçim, `[A + B]` çoklu seçim. En çok bir giriş satırı.
 * Etiket kişinin sözü olarak gideceği için kısa ve düz yazı olmak zorunda. Görünmez karakter ya da biçimlendirme taşıyan soruda düğme yok: görünen ile okunan ayrılmasın.
 * @param {unknown} soru
 * @returns {{ metin: string, secenekler: string[], coklu: boolean }[] | null}
 */
export function secenekCoz(soru) {
  if (typeof soru !== 'string' || soru.length === 0) return null;
  const satirlar = soru.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
  if (satirlar.some((s) => s.length > SORU_SATIR_TAVANI || GORUNMEZ.test(s) || SORU_YASAK.test(s))) return null;
  if (satirlar.length === 1 && EVET_HAYIR.test(satirlar[0]) && !/^\d{1,2}[.)]\s/.test(satirlar[0])) {
    const metin = satirlar[0].replace(EVET_HAYIR, '').trim();
    if (metin.length === 0 || metin.length > 200 || soruSayisi(metin) > 1) return null;
    return [{ metin, secenekler: ['Evet', 'Hayır'], coklu: false }];
  }
  const govde = satirlar.length > 1 && !SECENEK_SATIRI.test(satirlar[0]) && !/^\d{1,2}[.)]\s/.test(satirlar[0]) ? satirlar.slice(1) : satirlar;
  if (govde.length === 0 || govde.length > EN_COK_SORU) return null;
  // Atılan giriş satırı soru taşıyorsa ekrandaki soru sayısı düğmeyle tutmaz: tek tık başka soruya evet sayılabilir (tarama O1).
  if (govde.length < satirlar.length && (soruSayisi(satirlar[0]) > 0 || satirlar[0].includes('[') || EVET_HAYIR.test(satirlar[0]))) return null;
  // Düğme satırı 1, 2 diye gider: yazılı numara başka olursa cevap yanlış soruya okunur (tarama O2).
  const numaralar = govde.map((s) => /^(\d{1,2})[.)]\s+/u.exec(s));
  if (numaralar.some((n) => n !== null) && numaralar.some((n, i) => n === null || Number(n[1]) !== i + 1)) return null;
  const sorular = [];
  for (const [i, s] of govde.entries()) {
    // Numaralı satırda evet/hayır da sorudur (4 Kas gerçek yanıt: "2. ... evet/hayır" bütün soruyu düğmesiz bırakmıştı).
    const numara = numaralar[i];
    if (numara && EVET_HAYIR.test(s)) {
      const metin = s.slice(numara[0].length).replace(EVET_HAYIR, '').trim();
      if (metin.length === 0 || metin.length > 200 || soruSayisi(metin) > 1) return null;
      sorular.push({ metin, secenekler: ['Evet', 'Hayır'], coklu: false });
      continue;
    }
    const e = SECENEK_SATIRI.exec(s);
    if (!e || soruSayisi(e[1]) > 1) return null;
    const coklu = e[2].includes(' + ');
    const secenekler = e[2].split(coklu ? ' + ' : ' | ').map((x) => x.trim());
    if (secenekler.length < 2 || secenekler.length > EN_COK_SECENEK) return null;
    if (!secenekler.every((x) => SECENEK_ETIKETI.test(x))) return null;
    if (new Set(secenekler.map(anahtar)).size !== secenekler.length) return null;
    sorular.push({ metin: e[1].trim(), secenekler, coklu });
  }
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
  return `${secimler.map((s, i) => `${i + 1}: ${s.join(', ')}`).join('; ')}.`;
}

/** Tek soru ve tek seçimde basınca hemen gider; gerisi işaretlenir, "Gönder"le gider. */
/**
 * Düğme bu kartta çıkar mı. Yalnız son yanıt (`sonSoru`: Stop yazar, yeni istem siler; yeniden yüklemede boş). Başka pencereden geliyorsa doğrulanmış olmalı ve onay istemi olmamalı:
 * onay yalnız sitede. Mesaj gelen turda etiketsiz soruya düğme yok: pencere mesajı kendi sorusu gibi görünmesin (tarama Ek 12 Y2).
 * @param {{ soru: string, kaynak: { etiket: string } | null }} kapanis
 * @param {{ dogrulandi: boolean } | null} kaynakBilgi
 * @param {string} sonSoru
 * @param {boolean} mesajliTur
 * @param {string} [acikSoru] mesaj geldiği anda açık olan, kişinin turunda sorulmuş soru: model aynen yineleyince düğme kalır (4 Kas gerçek deneme, tarama Ek 16 Y1)
 * @returns {boolean}
 */
export function dugmeIzni(kapanis, kaynakBilgi, sonSoru, mesajliTur, acikSoru = '') {
  if (!sonSoru || sonSoru !== kapanis.soru) return false;
  if (kapanis.kaynak) return kaynakBilgi?.dogrulandi === true && kapanis.kaynak.etiket !== 'ONAY İSTİYOR';
  return !mesajliTur || (acikSoru !== '' && acikSoru === kapanis.soru);
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
 * ONAY İSTİYOR düğme almaz: onay isteyen pencere yalnız kendi talebinin kararını kabul eder, onay sitede.
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

/** Düz çizilen satırı saran kalın işareti atar; satır içindeki yıldızlara dokunmaz. */
export const duzMetin = (metin) => String(metin ?? '').replace(/^\*\*(.+)\*\*$/u, '$1');

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
 * @returns {{ parcalar: ({ tur: 'metin', metin: string } | { tur: 'kart', pencere: string, ajan: string, etiket: 'SORU' | 'ONAY İSTİYOR' | 'BİLGİ', kimlik: string | null, metin: string, sorular: { metin: string, secenekler: string[], coklu: boolean }[] | null })[], kapanis: { soru: string, gorunur: string, ayrinti: string, kaynak: { pencere: string, ajan: string, etiket: 'SORU' | 'ONAY İSTİYOR' | 'BİLGİ', kimlik: string | null } | null, sorular: { metin: string, secenekler: string[], coklu: boolean }[] | null } | null } | null}
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
  return { parcalar, kapanis: k ? { soru: k.soru, gorunur: k.gorunur, ayrinti: k.ayrinti, kaynak: k.kaynak, sorular: tekrar(k.kaynak?.kimlik) ? null : secenekCoz(k.soru) } : null };
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
  const alanVar = typeof govde.kart_acik === 'boolean' || Array.isArray(govde.kart_kaynaklari);
  if (!alanVar) return null;
  const acik = typeof govde.kart_acik === 'boolean' ? govde.kart_acik : eskiAcik;
  const gelen = (Array.isArray(govde.kart_kaynaklari) ? govde.kart_kaynaklari : [])
    .filter((k) => k && typeof k.ad === 'string' && k.ad.length > 0 && k.ad.length <= AD_TAVANI && typeof k.kimlik === 'string' && /^[0-9a-f]{6}$/.test(k.kimlik))
    .map((k) => ({ ad: k.ad, kimlik: k.kimlik, renk: renkGecerli(k.renk) ? k.renk : null, ...(typeof k.ajan === 'string' ? { ajan: k.ajan } : {}) }));
  const yeni = new Set(gelen.map((k) => k.kimlik));
  const kaynaklar = [...gelen, ...eskiKaynak.filter((k) => k && !yeni.has(k.kimlik))].slice(0, KAYNAK_TAVANI);
  if (ayni && acik === eskiAcik && JSON.stringify(kaynaklar) === JSON.stringify(eskiKaynak)) return null;
  return { baglanti_id: id, acik, kaynaklar };
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
