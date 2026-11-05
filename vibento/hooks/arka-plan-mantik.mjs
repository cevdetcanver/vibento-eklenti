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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIRE_ILE_BASLAR = /^[\s-]/;

const sayi = (d, enCok) => typeof d === 'number' && Number.isFinite(d) && d > 0 && d <= enCok;

/** Sunucudan gelen iş biçimce geçerli mi (içerik yok; görev mesajda). Tire ya da boşlukla başlayan ad ve klasör reddedilir. */
export function isGecerli(is) {
  if (!is || typeof is !== 'object') return false;
  return UUID.test(String(is.id))
    && (is.tur === 'yeni' || is.tur === 'devam')
    && typeof is.klasor === 'string' && is.klasor.length > 0 && is.klasor.length <= 1024 && !TIRE_ILE_BASLAR.test(is.klasor)
    && typeof is.dis_seans_id === 'string' && UUID.test(is.dis_seans_id)
    && typeof is.ad === 'string' && is.ad.trim().length > 0 && is.ad.length <= 160 && !/[\r\n]/.test(is.ad) && !TIRE_ILE_BASLAR.test(is.ad)
    && MODELLER.includes(is.model)
    && sayi(is.tur_usd, 1000)
    && sayi(is.butce_usd, 100_000);
}

/**
 * Tek yoklayan: başka oturumun taze kaydı varsa bu pencere yoklamaz; kendi kaydı ya da bayat kayıt üstüne yazılır.
 * Yarış zararsızdır (iş alma ve bağlantı başına koşu tavanı sunucuda atomik); kayıt yalnız boşa isteği azaltır.
 */
export function yoklayanKarari(kayit, oturum, simdiMs) {
  const k = kayit && typeof kayit === 'object' ? kayit : null;
  const sahip = typeof k?.oturum === 'string' ? k.oturum : null;
  const at = Date.parse(typeof k?.at === 'string' ? k.at : '');
  const taze = Number.isFinite(at) && simdiMs - at < TEK_YOKLAYAN_MS && at - simdiMs < TEK_YOKLAYAN_MS;
  if (sahip && sahip !== oturum && taze) return { yokla: false, yaz: false };
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
 * bir değer hiçbir zaman ayrı bir seçenek gibi okunamaz. Bütçe: Claude Code `--max-budget-usd`'yi konuşmanın TOPLAMIYLA kıyaslar
 * (ölçüm 5 Kas), bu yüzden devamda tavan = bilinen önceki toplam + turun tavanı (`butce_usd`, sunucu hesaplar).
 */
export function argumanlar(is, ikili, istem = SABIT_ISTEM) {
  const devam = is.tur === 'devam';
  return [
    ikili,
    '-p', istem,
    devam ? `--resume=${is.dis_seans_id}` : `--session-id=${is.dis_seans_id}`,
    ...(devam ? [] : [`--name=${is.ad}`]),
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

/**
 * `--output-format stream-json` çıktısı: son `result` olayı. `total_cost_usd` ve `modelUsage` konuşmanın TOPLAMIDIR (ölçüm 5 Kas);
 * bu turun kullanımı `usage` alanındadır (token kırılımı). Sunucu tutarı tokenlardan hesaplar; toplam sonraki turun bütçe tabanıdır.
 */
export function sonucAyristir(cikti) {
  const m = String(cikti ?? '');
  const satirlar = m.split('\n');
  for (let i = satirlar.length - 1; i >= 0; i -= 1) {
    const s = satirlar[i].trim();
    if (!s.startsWith('{')) continue;
    let j;
    try { j = JSON.parse(s); } catch { continue; }
    if (!j || typeof j !== 'object' || !('is_error' in j)) continue;
    const u = j.usage && typeof j.usage === 'object' ? j.usage : {};
    const modeller = j.modelUsage && typeof j.modelUsage === 'object' ? Object.keys(j.modelUsage) : [];
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
      model: modeller.length === 1 ? modeller[0] : null,
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
