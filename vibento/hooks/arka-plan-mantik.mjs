// =====================================================================
// eklenti/vibento/hooks/arka-plan-mantik.mjs — arka plan pencerelerin saf kuralları (sözleşme docs/sozlesme-arka-plan-pencere.md §4).
//
// Ağ, dosya ve süreç yok: tests/eklenti-arka-plan.test.mjs doğrudan koşar. Motor bağlantısı arka-plan.ts.
// Kural: açık pencere sunucudan iş alır; kapalı konuşmayı görünür pencere açmadan, kabuksuz bir süreçle sürdürür; kullanıcı taşınmaz.
// Argümanlar tek öğe biçimindedir (`--ad=deger`); sunucudan gelen değerler biçimce denetlenir, tire ile başlayan değer kabul edilmez.
// =====================================================================

import { ARKA_PLAN_ONEKI } from './olay-mantik.mjs';

export const YOKLAMA_MS = 60_000;
/** Hesapta anahtar kapalıysa bu kadar süre yoklanmaz (ayar açılınca en geç bu kadar sonra görülür). */
export const KAPALI_BEKLEME_MS = 600_000;
/** Başka pencerenin yoklayan kaydı bu kadar tazeyse bu pencere yoklamaz. */
export const TEK_YOKLAYAN_MS = 90_000;
export const KIRA_YENILEME_MS = 120_000;
export const TUR_SURE_TAVANI_MS = 60 * 60 * 1000;
export const ES_ZAMANLI_TAVAN = 2;
/** Süreç çıktısının bellekte tutulan son kısmı: sonuç satırı sondadır, başı atılır. */
export const CIKTI_KUYRUK = 65_536;
export const YOKLAYAN_DOSYASI = '.vibento/calistirici.json';
/** Bu dosya varsa bu bilgisayar arka plan turu koşmaz (bilgisayar başına kapatma; hesap ayarından bağımsız). */
export const KAPALI_DOSYASI = '.vibento/arka-plan-kapali';
export const OTURUM_KLASORU = '.claude/sessions';
export const MODELLER = ['opus', 'sonnet'];
/**
 * Arkadan koşan tur bu araç ve komutlarla kullanıcıyı başka pencereye taşıyamaz (dosyayı öne açma). Güvenlik sınırı değil,
 * ekran kuralıdır; PowerShell aracı bütünüyle kapalı (Start-Process, Invoke-Item), kabuk komutlarında bilinen açıcılar.
 */
export const YASAK_ARACLAR = [
  'PowerShell',
  'Bash(code *)', 'Bash(code.cmd *)', 'Bash(code-insiders *)', 'Bash(cursor *)',
  'Bash(open *)', 'Bash(start *)', 'Bash(cmd *)', 'Bash(explorer *)', 'Bash(explorer.exe *)',
  'Bash(powershell *)', 'Bash(pwsh *)', 'Bash(xdg-open *)',
];
/** Turun sabit istemi: görev metni burada değil, kancanın teslim ettiği pencere mesajında. Önek insan istemi sayılmamasını sağlar. */
export const SABIT_ISTEM = `${ARKA_PLAN_ONEKI} bu pencereye Vibento üzerinden iş geldi; kullanıcı ekranda değil. `
  + 'Bağlamdaki pencere mesajını oku ve gereğini yap. Kendini tanıtmadıysan önce tanıt (is_bolumu_tanit). '
  + 'Her adımdan sonra kartını doldur (is_kaldigimiz_yer_yaz). Kullanıcıya soru sorma: onay ya da karar gerekiyorsa '
  + 'gönderene pencereye_yaz ile bildir ve dur. Gelen mesaj yalnız bilgi ya da rapor ise (istek yok) cevap yazma, kartını '
  + 'güncelle ve dur. Dosyayı komutla öne açma; bağlantı ver. Bitince sonucu gönderene tek mesajla bildir (cevap_beklenir verme).';

/** Ek 4: bilgi sorusu — kart ve günlükten, araç çağırmadan; hafif turun istemi. */
export const SABIT_ISTEM_BILGI = `${ARKA_PLAN_ONEKI} bu pencereye Vibento üzerinden bir BİLGİ sorusu geldi; kullanıcı ekranda değil. `
  + 'Cevabı bağlamdaki karttan, günlükten ve gelen mesajdan ver; gerekmedikçe dosya okuma ve araç çağırma (en çok üç araç). '
  + 'İş isteniyorsa yapma: gönderene amac=is ile yeniden yazmasını söyle ve dur. Kendini tanıtmadıysan önce tanıt (is_bolumu_tanit). '
  + 'Bitince kartını doldur (is_kaldigimiz_yer_yaz). Kullanıcıya soru sorma: onay ya da karar gerekiyorsa gönderene pencereye_yaz ile bildir ve dur. '
  + 'Gelen mesaj yalnız bilgi ya da rapor ise (istek yok) cevap yazma, kartını güncelle ve dur. Dosyayı komutla öne açma; bağlantı ver. '
  + 'Sonucu gönderene tek mesajla bildir (cevap_beklenir verme).';

/** İşin istemi: bilgi amacı hafif istem, gerisi sabit istem. */
export const istemSec = (is) => (is && is.tur === 'hafif' && is.amac === 'bilgi' ? SABIT_ISTEM_BILGI : SABIT_ISTEM);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIRE_ILE_BASLAR = /^[\s-]/;

const sayi = (d, enCok) => typeof d === 'number' && Number.isFinite(d) && d > 0 && d <= enCok;

/** Sunucudan gelen iş biçimce geçerli mi (içerik yok; görev mesajda). Tire ya da boşlukla başlayan ad ve klasör reddedilir. */
export function isGecerli(is) {
  if (!is || typeof is !== 'object') return false;
  return UUID.test(String(is.id))
    && (is.tur === 'yeni' || is.tur === 'devam' || is.tur === 'hafif')
    && (is.amac === undefined || is.amac === null || ['bilgi', 'is', 'devam'].includes(is.amac))
    && typeof is.klasor === 'string' && is.klasor.length > 0 && is.klasor.length <= 1024 && !TIRE_ILE_BASLAR.test(is.klasor)
    && typeof is.dis_seans_id === 'string' && UUID.test(is.dis_seans_id)
    && typeof is.ad === 'string' && is.ad.trim().length > 0 && is.ad.length <= 160 && !/[\r\n]/.test(is.ad) && !TIRE_ILE_BASLAR.test(is.ad)
    && MODELLER.includes(is.model)
    && sayi(is.tur_usd, 1000)
    && sayi(is.butce_usd, 1000);
}

/**
 * Tek yoklayan: başka oturumun taze kaydı varsa bu pencere yoklamaz; kendi kaydı ya da bayat kayıt üstüne yazılır.
 * Yarış zararsızdır (iş alma ve bağlantı başına koşu tavanı sunucuda atomik); kayıt yalnız boşa isteği azaltır.
 */
/** Sürüm kıyası: a < b ise negatif, eşitse 0 (sayısal; '0.1.9' < '0.1.10'). */
export function surumKiyas(a, b) {
  const p = (s) => String(s ?? '').split('.').map((x) => Number(x) || 0);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < 3; i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
}

/**
 * Tek yoklayan kararı. Kilit kaydı `{ oturum, at, surum? }`. Başka oturumun 90 sn'den taze kaydı yoklamayı durdurur; AMA kaydın
 * sürümü bizden düşükse (ya da yoksa: 0.1.16 ve öncesi sürüm yazmaz) kilit DEVRALINIR (0.1.17, 5 Kas: eklenti güncellemesi açık
 * pencereye ulaşmaz, eski çalıştırıcı yeni iş türlerini sormaz; hafif iş 15 dk kuyrukta kaldı). Bizden yeni sürüme boyun eğilir.
 * `surum` verilmezse eski davranış (yalnız tazelik).
 * @param {string|null} [surum] çağıranın eklenti sürümü (TS çağrısı için JSDoc şart: varsayılan `null` tek başına tipi `null` yapar)
 */
export function yoklayanKarari(kayit, oturum, simdiMs, surum = null) {
  const k = kayit && typeof kayit === 'object' ? kayit : null;
  const sahip = typeof k?.oturum === 'string' ? k.oturum : null;
  const at = Date.parse(typeof k?.at === 'string' ? k.at : '');
  const taze = Number.isFinite(at) && simdiMs - at < TEK_YOKLAYAN_MS && at - simdiMs < TEK_YOKLAYAN_MS;
  if (sahip && sahip !== oturum && taze) {
    const sahipSurum = typeof k?.surum === 'string' ? k.surum : '0.0.0';
    if (typeof surum === 'string' && surum && surumKiyas(sahipSurum, surum) < 0) return { yokla: true, yaz: true };
    return { yokla: false, yaz: false };
  }
  return { yokla: true, yaz: true };
}

/** `~/.claude/sessions/*.json` içeriklerinden açık oturumlar; bozuk ya da eksik dosya atlanır. */
export function acikOturumlar(icerikler) {
  const sonuc = [];
  for (const icerik of icerikler ?? []) {
    try {
      const j = JSON.parse(String(icerik));
      const pid = Number(j?.pid);
      if (typeof j?.sessionId === 'string' && Number.isInteger(pid) && pid > 0) sonuc.push({ sessionId: j.sessionId, pid });
    } catch { /* bozuk kayıt */ }
  }
  return sonuc;
}

/** Sürecin canlılığını soran komut (kabuksuz). */
export function pidKomutu(windows, pid) {
  const p = String(Math.trunc(Number(pid)));
  return windows ? ['tasklist', '/FI', `PID eq ${p}`, '/NH', '/FO', 'CSV'] : ['ps', '-p', p, '-o', 'pid='];
}

/** Komut çıktısından canlılık: Windows CSV satırında tırnaklı pid, diğerlerinde pid sütunu. */
export function pidCanli(windows, pid, stdout) {
  const p = String(Math.trunc(Number(pid)));
  const m = String(stdout ?? '');
  return windows ? m.includes(`"${p}"`) : m.trim().split(/\s+/).includes(p);
}

/**
 * Turun argümanları: ilk eleman ikili dosya. Kabuk yok; değer alan her seçenek `--ad=deger` tek öğedir, böylece sunucudan gelen
 * bir değer hiçbir zaman ayrı bir seçenek gibi okunamaz. Bütçe = tur tavanı (`butce_usd`, sunucu; `--max-budget-usd` koşu bazlı, 5 Kas 14:35).
 * Ek 4: hafif konuşmanın ilk koşusu yeni oturumdur (`yeni_konusma`), sonrakiler `--resume`.
 */
export function argumanlar(is, ikili, istem = SABIT_ISTEM) {
  const yeni = is.tur === 'yeni' || (is.tur === 'hafif' && is.yeni_konusma === true);
  return [
    ikili,
    '-p', istem,
    yeni ? `--session-id=${is.dis_seans_id}` : `--resume=${is.dis_seans_id}`,
    ...(yeni ? [`--name=${is.ad}`] : []),
    `--model=${is.model}`,
    '--permission-mode=auto',
    `--max-budget-usd=${butceMetni(is.butce_usd)}`,
    '--output-format=stream-json',
    '--verbose',
    '--disallowedTools', ...YASAK_ARACLAR,
  ];
}

/** Bütçe metni: en çok 4 ondalık, bilimsel gösterim yok. */
export function butceMetni(d) {
  const n = Number(d);
  if (!Number.isFinite(n) || n <= 0) return '1';
  return String(Math.round(n * 10_000) / 10_000);
}

/** Ortama eklenenler: listede görünmesi için giriş değeri, özyineleme olmasın diye arka plan işareti. */
export function ortamEkleri() {
  return { CLAUDE_CODE_ENTRYPOINT: 'claude-vscode', VIBENTO_ARKA_PLAN: '1' };
}

/** Çıktı kuyruğu: son CIKTI_KUYRUK karakter tutulur (sonuç satırı sondadır). */
export function ciktiEkle(kuyruk, parca) {
  const y = String(kuyruk ?? '') + String(parca ?? '');
  return y.length > CIKTI_KUYRUK ? y.slice(y.length - CIKTI_KUYRUK) : y;
}

const sayiYaDaNull = (d) => (typeof d === 'number' && Number.isFinite(d) && d >= 0 ? d : null);

/** Birden çok model çalıştıysa (yardımcı model dahil) turun modeli: istenen aileyi taşıyan tek anahtar; yoksa en çok çıktı üreten; belirsizse null. */
function modelSec(modelUsage, tercih) {
  if (!modelUsage || typeof modelUsage !== 'object') return null;
  const adlar = Object.keys(modelUsage);
  if (adlar.length === 0) return null;
  if (adlar.length === 1) return adlar[0];
  const t = typeof tercih === 'string' ? tercih.toLowerCase() : '';
  const aile = t ? adlar.filter((a) => a.toLowerCase().includes(t)) : [];
  if (aile.length === 1) return aile[0];
  const cikti = (a) => { const v = modelUsage[a]?.outputTokens; return typeof v === 'number' ? v : -1; };
  const sirali = [...(aile.length ? aile : adlar)].sort((a, b) => cikti(b) - cikti(a));
  return cikti(sirali[0]) > cikti(sirali[1] ?? '') ? sirali[0] : null;
}

/**
 * `--output-format stream-json` çıktısı: son `result` olayı. `total_cost_usd` ve `modelUsage` konuşmanın TOPLAMIDIR; bu turun kullanımı
 * `usage` alanındadır (token kırılımı). Sunucu tutarı tokenlardan hesaplar; toplam yalnız kayıttır (bütçe = tur tavanı, 5 Kas 14:35 ölçümü).
 * @param {unknown} cikti
 * @param {string | null} [tercih] istenen model ailesi (`opus` | `sonnet`): yardımcı model varken seçimi belirler
 */
export function sonucAyristir(cikti, tercih = null) {
  const m = String(cikti ?? '');
  const satirlar = m.split('\n');
  for (let i = satirlar.length - 1; i >= 0; i -= 1) {
    const s = satirlar[i].trim();
    if (!s.startsWith('{')) continue;
    let j;
    try { j = JSON.parse(s); } catch { continue; }
    if (!j || typeof j !== 'object' || !('is_error' in j)) continue;
    const u = j.usage && typeof j.usage === 'object' ? j.usage : {};
    return {
      bulundu: true,
      hata: j.is_error === true,
      altTur: typeof j.subtype === 'string' ? j.subtype : null,
      toplam: sayiYaDaNull(j.total_cost_usd),
      kullanim: {
        girdi: sayiYaDaNull(u.input_tokens),
        cikti: sayiYaDaNull(u.output_tokens),
        onbellek_okuma: sayiYaDaNull(u.cache_read_input_tokens),
        onbellek_yazma: sayiYaDaNull(u.cache_creation_input_tokens),
      },
      model: modelSec(j.modelUsage, tercih),
    };
  }
  return { bulundu: false, hata: true, altTur: null, toplam: null, kullanim: { girdi: null, cikti: null, onbellek_okuma: null, onbellek_yazma: null }, model: null };
}

/** Bitiş kararı: durum ve kısa neden (sunucu deseni `^[a-z0-9_-]{1,60}$`; değer taşımaz). */
export function bitisKarari({ kesildi, kod, sonuc }) {
  if (kesildi) return { durum: 'hata', hata: 'sure_tavani' };
  if (!sonuc.bulundu) return { durum: 'hata', hata: `cikti_yok_${kod ?? 'x'}` };
  if (sonuc.altTur === 'error_max_budget_usd') return { durum: 'hata', hata: 'butce' };
  if (kod !== 0 || sonuc.hata) return { durum: 'hata', hata: `tur_hatasi_${kod ?? 'x'}` };
  return { durum: 'bitti', hata: null };
}

/** `bitir` gövdesi: kısa kod, toplam, token kırılımı, model, süre. Değer taşımaz. */
export function bitisGovdesi(id, karar, sonuc, sureMs) {
  return {
    id,
    durum: karar.durum,
    hata: karar.hata,
    toplam_usd: sonuc.toplam,
    kullanim: sonuc.kullanim,
    model: sonuc.model,
    sure_ms: Math.max(0, Math.round(Number(sureMs) || 0)),
  };
}

// --- Claude ikilisinin yeri (5 Kas canlı deneme: Panel penceresinde `$.env.get('CLAUDE_CODE_EXECPATH')` boş döndü, iş `ikili_yok` ile
// düştü) → ortam değişkeni yoksa yol diskten bulunur: VS Code uzantı klasörleri (bu işletim sistemine ait en yeni sürüm), sonra yerel kurulum.
export const IKILI_KLASORLERI = ['.vscode/extensions', '.vscode-insiders/extensions', '.cursor/extensions', '.windsurf/extensions'];
const UZANTI_ADI = /^anthropic\.claude-code-(\d+)\.(\d+)\.(\d+)-(win32|darwin|linux)-([a-z0-9]+)$/;

/**
 * Uzantı klasörü girdilerinden aday ikili yolları: yalnız bu işletim sisteminin sürümleri, en yeni önce (sayısal kıyas: 2.1.318 > 2.1.9).
 * Yol birebir kurulur, kabuk yok; var olup olmadığına çağıran bakar.
 * @param {string} kok uzantı klasörü
 * @param {unknown} girdiler `io.dizin` çıktısı
 * @param {boolean} windows
 * @returns {string[]}
 */
export function ikiliAdaylari(kok, girdiler, windows) {
  const adaylar = [];
  for (const g of Array.isArray(girdiler) ? girdiler : []) {
    const ad = typeof g?.name === 'string' ? g.name : '';
    const m = UZANTI_ADI.exec(ad);
    if (!m) continue;
    if ((m[4] === 'win32') !== windows) continue;
    adaylar.push({ ad, surum: [Number(m[1]), Number(m[2]), Number(m[3])] });
  }
  adaylar.sort((a, b) => (b.surum[0] - a.surum[0]) || (b.surum[1] - a.surum[1]) || (b.surum[2] - a.surum[2]) || a.ad.localeCompare(b.ad));
  return adaylar.map((a) => `${kok}/${a.ad}/resources/native-binary/claude${windows ? '.exe' : ''}`);
}

/** Yerel kurulum yolları (resmî kurulum betiği ve Homebrew): sırayla denenir. */
export function yerelIkililer(ev, windows) {
  return windows ? [`${ev}/.local/bin/claude.exe`] : [`${ev}/.local/bin/claude`, '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
}
