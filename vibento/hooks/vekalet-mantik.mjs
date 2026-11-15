// =====================================================================
// eklenti/vibento/hooks/vekalet-mantik.mjs — pencere içi Vekâlet göstergesi (0.1.26; sözleşme docs/sozlesme-unvanlar.md Ek D2d madde 4).
// Saf mantık; ağ, depo ve saat yok (saat parametredir). Hiçbir girdide fırlatmaz.
//
// Gösterge YALNIZ GÖRÜNÜMDÜR: sürüm satırının sonuna eklenir, konuşmaya girmez (token harcamaz), sunucuya geri gönderilmez ve hiçbir karara
// girdi olmaz. Karar anında sunucu Vekâlet'i yeniden okur (D2c ⑩). Sunucudan gelen METİN satıra girmez: yalnız çözülen an, yerel saatle.
// =====================================================================

/**
 * Bitişin şimdiden en çok ne kadar ileride olabileceği: en uzun süre (480 dk) + 5 dakika saat farkı payı. Aynası: `src/server/vekalet.mjs`
 * `BITIS_TAVANI_MS` (`VEKALET_SURELERI_DK` en büyüğü + 5); göç 0060 `vekalet_sure_ck`. Biri değişirse öbürü de değişir.
 */
export const VEKALET_TAVAN_MS = (480 + 5) * 60_000;

/** Yanıttaki bitiş dizgesinin en çok uzunluğu (ISO anı 24-32 karakterdir; daha uzunu beklenmeyen veridir). */
const BITIS_UZUNLUK_TAVANI = 40;

/**
 * Kanca yanıtının `vekalet` alanı. Alan YOKSA `{ var: false }` (ağ hatası, eski sunucu, istenmemiş yanıt: çağıran son bilinen değeri
 * tutar). Alan varsa `{ var: true, bitis }`: `bitis` yalnız `govde.vekalet.bitis` çözülebilen bir an dizgesiyse dolu, `null` ve her
 * bozuk biçimde null (çağıran göstergeyi siler: okunamayan Vekâlet kapalı sayılır).
 * @param {unknown} govde
 * @returns {{ var: false } | { var: true, bitis: string | null }}
 */
export function vekaletBitisAl(govde) {
  try {
    if (!govde || typeof govde !== 'object' || !Object.prototype.hasOwnProperty.call(govde, 'vekalet')) return { var: false };
    const v = /** @type {Record<string, unknown>} */ (govde).vekalet;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const bitis = /** @type {Record<string, unknown>} */ (v).bitis;
      if (typeof bitis === 'string' && bitis.length <= BITIS_UZUNLUK_TAVANI && Number.isFinite(Date.parse(bitis))) {
        return { var: true, bitis };
      }
    }
    return { var: true, bitis: null };
  } catch {
    return { var: false };
  }
}

/** @param {number} n */
const ikiHane = (n) => String(n).padStart(2, '0');

/**
 * Satır parçası: `"Vekâlet açık (bitiş SS:DD)"` ya da null. Açık YALNIZ bitiş çözülebilen bir an, `simdiMs`'ten KESİN sonra ve en çok
 * `VEKALET_TAVAN_MS` ileride ise (`vekalet.mjs` `vekaletDurumu` ile aynı ölçü); `simdiMs` sonlu bir sayı değilse null. Saat ve dakika
 * bilgisayarın YEREL saatiyle, iki haneli.
 * @param {unknown} bitis
 * @param {unknown} simdiMs
 * @returns {string | null}
 */
export function vekaletParcasi(bitis, simdiMs) {
  try {
    if (typeof bitis !== 'string') return null;
    if (typeof simdiMs !== 'number' || !Number.isFinite(simdiMs)) return null;
    const bitisMs = Date.parse(bitis);
    if (!Number.isFinite(bitisMs)) return null;
    const kalanMs = bitisMs - simdiMs;
    if (kalanMs <= 0 || kalanMs > VEKALET_TAVAN_MS) return null;
    const an = new Date(bitisMs);
    return `Vekâlet açık (bitiş ${ikiHane(an.getHours())}:${ikiHane(an.getMinutes())})`;
  } catch {
    return null;
  }
}

/**
 * İstem kutusunun altındaki satır: sürüm satırı ve Vekâlet parçası ` · ` ile; boş ya da dizge olmayan taraf atlanır.
 * @param {unknown} surum
 * @param {unknown} parca
 * @returns {string}
 */
export function durumSatiri(surum, parca) {
  return [surum, parca].filter((p) => typeof p === 'string' && p.length > 0).join(' · ');
}
