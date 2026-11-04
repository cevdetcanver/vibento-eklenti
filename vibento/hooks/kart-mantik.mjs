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
const IZ = /^\*\*İz:\*\*/u;
const KAPANIS_BASI = /^(\*\*)?(Güven:|Kural hatırlatması:|Dayanak:|Hesap defteri:|Hatırlatma:|Beklerken:)/u;
const CIT = /^\s*(```|~~~)/;

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
  return { bas, soru, gorunur, ayrinti };
}

const temizAd = (ad) => ad.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();

/**
 * Yanıt metni → çizim planı. Çizilecek bir şey yoksa null: satıra dokunulmaz.
 * @param {unknown} metin
 * @returns {{ parcalar: ({ tur: 'metin', metin: string } | { tur: 'kart', pencere: string, ajan: string, etiket: 'SORU' | 'ONAY İSTİYOR' | 'BİLGİ', kimlik: string | null, metin: string })[], kapanis: { soru: string, gorunur: string, ayrinti: string } | null } | null}
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
  let citte = false;
  const bosalt = () => {
    const m = birikim.join('\n').replace(/^\n+|\s+$/g, '');
    if (m) parcalar.push({ tur: 'metin', metin: m });
    birikim = [];
  };
  for (const s of govde) {
    if (CIT.test(s)) citte = !citte;
    const e = citte ? null : ETIKET_SATIRI.exec(s);
    const pencere = e ? temizAd(e[1]) : '';
    const ajan = e ? temizAd(e[2]) : '';
    if (!e || !pencere || !ajan) { birikim.push(s); continue; }
    bosalt();
    kartVar = true;
    parcalar.push({ tur: 'kart', pencere, ajan, etiket: e[3], kimlik: e[4] ?? null, metin: e[5].trim() });
  }
  bosalt();
  if (!kartVar && !k) return null;
  return { parcalar, kapanis: k ? { soru: k.soru, gorunur: k.gorunur, ayrinti: k.ayrinti } : null };
}

const anahtar = (ad) => String(ad).normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');
const renkGecerli = (r) => typeof r === 'string' && /^#[0-9A-Fa-f]{6}$/.test(r);

/**
 * Etiket sunucunun bu pencereye teslim ettiği bir mesaja mı ait: ad ve kimlik birlikte eşleşmeli (tarama Ek 11 O3).
 * Sahte etiket gerçek pencerenin rengini ve kırmızısını alamaz; başka mesajın kimliğini kopyalasa da ad tutmaz.
 * @param {unknown} kaynaklar
 * @param {string} pencere
 * @param {string | null} kimlik
 * @returns {{ dogrulandi: boolean, renk: string | null }}
 */
export function kaynakBul(kaynaklar, pencere, kimlik) {
  if (!Array.isArray(kaynaklar) || !kimlik) return { dogrulandi: false, renk: null };
  const a = anahtar(pencere);
  for (const k of kaynaklar) {
    if (k && k.kimlik === kimlik && typeof k.ad === 'string' && anahtar(k.ad) === a) {
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
 * @returns {{ baglanti_id: string | null, acik: boolean, kaynaklar: { ad: string, kimlik: string, renk: string | null }[] } | null}
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
    .map((k) => ({ ad: k.ad, kimlik: k.kimlik, renk: renkGecerli(k.renk) ? k.renk : null }));
  const yeni = new Set(gelen.map((k) => k.kimlik));
  const kaynaklar = [...gelen, ...eskiKaynak.filter((k) => k && !yeni.has(k.kimlik))].slice(0, KAYNAK_TAVANI);
  if (ayni && acik === eskiAcik && JSON.stringify(kaynaklar) === JSON.stringify(eskiKaynak)) return null;
  return { baglanti_id: id, acik, kaynaklar };
}
