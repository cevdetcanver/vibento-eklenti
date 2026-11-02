// =====================================================================
// eklenti/vibento/hooks/kapi-mantik.mjs — ad kapısı ve onay kararının SAF mantığı (3g-3b ②).
//
// Kaynak: bugünkü kanca `src/server/kanca/02-kapi-onay-mesaj.mjs` (sözleşmeler docs/sozlesme-ad-kapisi.md §4, docs/sozlesme-onay-talebi.md
// Ek 5 E5.2). Davranış BİREBİR: tests/eklenti-kapi.test.mjs kancanın "saf yardımcılar" bloklarını şablondan kesip aynı girdilerde bu dosyayla
// karşılaştırır (fark testi). Yerel adım dosyası yerine `$.store` (anahtar `vibento.kapi.<oturum>`); dosyaya yazma kararı burada değil,
// çağıranın (`yerel` alanı: 'sil' · 'yaz' · null).
// Görünmez/denetim karakterleri kod noktasıyla kurulur (CLAUDE.md kırmızı çizgi).
// =====================================================================

import { istemTuru, ideBaglamiSoy } from './olay-mantik.mjs';

const KAPI_TIRNAKLARI = String.fromCharCode(
  0x22, 0x27, 0x60, 0x201c, 0x201d, 0x201e, 0x2018, 0x2019, 0x201a, 0xab, 0xbb, 0x2039, 0x203a,
);
const KAPI_UST_NOKTA = String.fromCharCode(0x307);
const CR = String.fromCharCode(0x0d);
const LF = String.fromCharCode(0x0a);
const KAPI_SARMAL = new RegExp(
  `^<pasted_content(?:\\s[^>${CR}${LF}]*)?>${CR}?${LF}([\\s\\S]*)${CR}?${LF}<[/]pasted_content(?:\\s[^>${CR}${LF}]*)?>$`,
);

function sarmalSoy(deger) {
  if (typeof deger !== 'string') return deger;
  const m = KAPI_SARMAL.exec(deger.trim());
  if (!m) return deger;
  if (m[1].indexOf('<pasted_content') !== -1 || m[1].indexOf('</pasted_content') !== -1) return deger;
  return m[1];
}

function adNormal(deger, kok) {
  if (typeof deger !== 'string') return '';
  let s = sarmalSoy(deger).normalize('NFC').trim().replace(/\s+/g, ' ');
  s = (kok ? s.toLowerCase() : s.toLocaleLowerCase('tr-TR')).split(KAPI_UST_NOKTA).join('');
  if (s.length >= 2 && KAPI_TIRNAKLARI.indexOf(s.charAt(0)) !== -1 && KAPI_TIRNAKLARI.indexOf(s.charAt(s.length - 1)) !== -1) {
    s = s.slice(1, -1);
  }
  return s;
}

/** İki ad aynı mı (tr-TR ya da kök küçük harfle). Boş ad hiçbir şeye eşit değildir. */
export function adEsit(a, b) {
  const x = adNormal(a, false);
  if (x.length > 0 && x === adNormal(b, false)) return true;
  const y = adNormal(a, true);
  return y.length > 0 && y === adNormal(b, true);
}

/** 'devam' mı (aynı biçim + sondaki tek '.' ya da '!'). */
export function devamMi(p) {
  let s = adNormal(p);
  const son = s.charAt(s.length - 1);
  if (son === '.' || son === '!') s = s.slice(0, -1);
  return s === 'devam';
}

const mesajGecerli = (m) => typeof m === 'string' && m.trim().length > 0;

/** Depodaki yerel adım: yalnız { kapi_id, ad, asama: 2 } geçerli; gerisi adım 1 (null). */
export function kapiYerelGecerli(d) {
  if (!d || typeof d !== 'object' || d.asama !== 2) return null;
  if (typeof d.kapi_id !== 'string' || d.kapi_id.length === 0) return null;
  if (typeof d.ad !== 'string' || d.ad.length === 0) return null;
  return d;
}

/** Depo anahtarı: oturum kimliğinin yalnız [A-Za-z0-9_-] kısmı. */
export function kapiAnahtari(seansId) {
  if (typeof seansId !== 'string') return null;
  const ad = seansId.replace(/[^A-Za-z0-9_-]/g, '');
  return ad.length > 0 ? `vibento.kapi.${ad}` : null;
}

/**
 * Gönderimden önce (kapiHazirla): İNSAN istemi + yerel adım 2 + ad eşleşti → kapi_onay = yerel kapının kimliği.
 * `anahtar`: yerel adımın depo anahtarı (oturum kimliği yoksa null — o zaman adım 2 yazılamaz, 'devam' durdurulmaz; kancada `dosya` null).
 * @returns {{ tur: string, yerel: { kapi_id: string, ad: string, asama: 2 } | null, onay: string | null, anahtar: string | null }}
 */
export function kapiHazirla(prompt, yerel, anahtar) {
  const tur = istemTuru(prompt);
  const y = kapiYerelGecerli(yerel);
  const onay = tur === 'insan' && y !== null && adEsit(ideBaglamiSoy(prompt), y.ad) ? y.kapi_id : null;
  return { tur, yerel: y, onay, anahtar: anahtar ?? null };
}

/**
 * Yanıttan karar (kapiKarari). Dönüş: { mesaj: durdurma metni ya da null, yerel: 'sil' | { kapi_id, ad, asama: 2 } (yaz) | null (dokunma) }.
 * @param {{ tur: string, yerel: { kapi_id: string } | null, onay: string | null, anahtar: string | null }} hazir
 * @param {Record<string, any> | null} govde
 * @param {unknown} prompt
 * @returns {{ mesaj: unknown, yerel: 'sil' | { kapi_id: string, ad: string, asama: 2 } | null }}
 */
export function kapiKarari(hazir, govde, prompt) {
  if (!govde || typeof govde !== 'object' || govde.ok !== true) return { mesaj: null, yerel: null };
  const kapi = govde.kapi;
  if (kapi === undefined || kapi === null) return { mesaj: null, yerel: 'sil' };
  if (typeof kapi !== 'object') return { mesaj: null, yerel: null };
  if (kapi.durum === 'kalkti') {
    return { mesaj: kapi.neden === 'onay' && hazir.onay !== null ? kapi.mesaj : null, yerel: 'sil' };
  }
  if (kapi.durum !== 'acik') return { mesaj: null, yerel: null };
  if (hazir.tur !== 'insan') return { mesaj: null, yerel: null };
  if (typeof kapi.id !== 'string' || kapi.id.length === 0) return { mesaj: null, yerel: null };
  if (typeof kapi.ad !== 'string' || kapi.ad.trim().length === 0) return { mesaj: null, yerel: null };
  if (hazir.yerel !== null && hazir.yerel.kapi_id === kapi.id) return { mesaj: kapi.mesaj_2, yerel: null };
  if (devamMi(ideBaglamiSoy(prompt))) {
    if (!hazir.anahtar || !mesajGecerli(kapi.mesaj_2)) return { mesaj: null, yerel: null };
    return { mesaj: kapi.mesaj_2, yerel: { kapi_id: kapi.id, ad: kapi.ad, asama: 2 } };
  }
  return { mesaj: kapi.mesaj_1, yerel: null };
}

// --- onay kararı (birebir) ---
const ONAY_KALIBI = /^\s*([A-Za-z0-9]{4})\s+(onay|onayla|ret|reddet)(?:\s+(.*))?\s*$/i;
const ONAY_SATIR_SONU = new RegExp(`[${String.fromCharCode(0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029)}]`);
const ONAY_NEDEN_TAVANI = 300;
const ONAY_KOD_RAKAM = /[0-9]/;
const ONAY_KOD_HARF = /[A-Za-z]/;

/** '<KOD> onay' / '<KOD> ret <neden>' → { kod, karar, neden } ya da null. */
export function onayKarariAyikla(metin) {
  if (typeof metin !== 'string' || ONAY_SATIR_SONU.test(metin)) return null;
  const m = ONAY_KALIBI.exec(metin);
  if (m === null) return null;
  if (!ONAY_KOD_RAKAM.test(m[1]) || !ONAY_KOD_HARF.test(m[1])) return null;
  const kelime = m[2].toLowerCase();
  const karar = kelime === 'onay' || kelime === 'onayla' ? 'onay' : 'ret';
  let neden = null;
  if (karar === 'ret' && typeof m[3] === 'string') {
    let n = m[3].replace(/\s+/g, ' ').trim();
    if (n.length > ONAY_NEDEN_TAVANI) {
      n = n.slice(0, ONAY_NEDEN_TAVANI);
      const son = n.charCodeAt(n.length - 1);
      if (son >= 0xd800 && son <= 0xdbff) n = n.slice(0, -1);
      n = n.trim();
    }
    if (n.length > 0) neden = n;
  }
  return { kod: m[1].toUpperCase(), karar, neden };
}

/** Durdurma yalnız: bu istekte onay_karari gönderildi + ok:true + onay_karari_sonucu.durdur === true + boş olmayan mesaj. */
export function onayKarariMesaji(gonderildi, govde) {
  if (gonderildi !== true) return null;
  if (!govde || typeof govde !== 'object' || govde.ok !== true) return null;
  const sonuc = govde.onay_karari_sonucu;
  if (!sonuc || typeof sonuc !== 'object' || Array.isArray(sonuc)) return null;
  if (sonuc.durdur !== true) return null;
  return mesajGecerli(sonuc.mesaj) ? sonuc.mesaj : null;
}

export { mesajGecerli };
