// =====================================================================
// eklenti/vibento/hooks/surum-mantik.mjs — eklentinin sürüm satırı (0.1.24): kullanıcı ekrana bakarak hangi sürümde olduğunu görsün.
// Saf mantık; ağ ve dosya yok.
//
// Üç sürüm ayrı şeydir: ÇALIŞAN (bu pencerenin belleğindeki kod, `SURUM`), KURULU (diskteki; `installed_plugins.json`) ve RAFTAKİ (sunucunun
// bildirdiği son yayın). Güncelleme açık pencereye kendiliğinden ulaşmaz: kurulu > çalışan ise pencere eski kodla koşuyordur ve bunu söyleyen
// tek yer bu satırdır. Satır istem kutusunun altında durur, konuşmaya girmez (token harcamaz).
// =====================================================================

const SURUM_BICIMI = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
/** Kurulu eklenti kaydının anahtarı `<eklenti>@<raf>`; raf adı değişse de eklenti adı sabittir. */
const EKLENTI_ONEKI = 'vibento@';
/** Kurulu sürüm kaydı, ev klasörüne göre (Claude Code'un eklenti kaydı; yalnız OKUNUR). */
export const KURULU_KAYDI = '.claude/plugins/installed_plugins.json';

/** @param {unknown} s @returns {s is string} */
export const surumGecerli = (s) => typeof s === 'string' && SURUM_BICIMI.test(s);

/** @param {string} a @param {string} b @returns {number} a < b ise negatif */
export function surumKiyas(a, b) {
  const p = (s) => String(s).split('.').map((x) => Number(x) || 0);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < 3; i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
}

/**
 * `installed_plugins.json` metninden Vibento'nun kurulu sürümü (birden çok kapsam varsa en yükseği). Okunamayan, bozuk ya da Vibento'suz
 * kayıt null: satır o zaman yalnız çalışan sürümü yazar.
 * @param {unknown} metin
 * @returns {string | null}
 */
export function kuruluSurumOku(metin) {
  try {
    const j = JSON.parse(String(metin));
    const eklentiler = j && typeof j === 'object' && j.plugins && typeof j.plugins === 'object' ? j.plugins : null;
    if (!eklentiler) return null;
    let enYuksek = null;
    for (const [ad, kayitlar] of Object.entries(eklentiler)) {
      if (!ad.startsWith(EKLENTI_ONEKI) || !Array.isArray(kayitlar)) continue;
      for (const k of kayitlar) {
        const s = k && typeof k === 'object' ? k.version : null;
        if (surumGecerli(s) && (enYuksek === null || surumKiyas(s, enYuksek) > 0)) enYuksek = s;
      }
    }
    return enYuksek;
  } catch {
    return null;
  }
}

/**
 * İstem kutusunun altındaki satır. Öncelik: indirilmiş ama yüklenmemiş sürüm (kullanıcının yapacağı tek şey yeniden yüklemek) > rafta yeni sürüm
 * > yalnız çalışan sürüm. Biçimsiz değer yok sayılır (sunucu ya da dosya metni satıra girmez).
 * @param {{ calisan: string, kurulu?: unknown, raf?: unknown }} g
 * @returns {string}
 */
export function surumSatiri({ calisan, kurulu = null, raf = null }) {
  const temel = `Vibento ${calisan}`;
  if (surumGecerli(kurulu) && surumKiyas(kurulu, calisan) > 0) {
    return `${temel} · ${kurulu} indi, bu pencere eski sürümle çalışıyor: /reload-plugins yaz`;
  }
  if (!surumGecerli(raf)) return temel;
  return surumKiyas(raf, calisan) > 0 ? `${temel} · yeni sürüm ${raf} çıktı` : `${temel} · güncel`;
}
