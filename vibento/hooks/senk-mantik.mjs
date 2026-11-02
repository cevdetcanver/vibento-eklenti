// =====================================================================
// eklenti/vibento/hooks/senk-mantik.mjs — sohbet kaydı (transkript) senkronunun SAF mantığı (3g-3c; DECISIONS 2 Kas ②).
//
// Kaynak: bugünkü kanca `src/server/kanca/04-senkron.mjs` (senkParcalaraBol, parcaDurumlariKur, senkGovdesiTemizle, pencere kesimi).
// Fark: mod ortamında Node yok ve `$.fs.read` dosyanın tamamını okur (4 MiB tavanı, aralıklı okuma yok) → dosya penceresi işletim sisteminin
// kendi aracıyla okunur (Windows PowerShell, Mac/Linux `tail | head`), çıktı base64. Komut kurucuları burada; argümanlar doğrulanır, yol
// komut metnine yalnız tek tırnak kaçışıyla girer (Windows) ya da konumsal argümandır (sh).
// =====================================================================

export const SENK_PARCA_MESAJ = 300;
export const SENK_PARCA_BAYT = 800_000;
export const PENCERE_VARSAYILAN = 2 * 1024 * 1024;
// `$.process.run` çıktı tavanı 4 MiB (4194304 bayt): base64 4/3 büyütür → ham pencere en çok 3.000.000 bayt.
export const PENCERE_TAVANI = 3_000_000;
const LF = 10;
// Yolda denetim karakteri (0x00-0x1f) olmaz; kod noktasıyla kurulur (CLAUDE.md kırmızı çizgi).
const DENETIM = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}]`);

// --- base64 (mod ortamında atob/btoa ölçülmedi; kendi çözücümüz) ---
const ALFABE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const TERS = (() => { const t = new Int16Array(128).fill(-1); for (let i = 0; i < ALFABE.length; i += 1) t[ALFABE.charCodeAt(i)] = i; return t; })();

export function base64Coz(metin) {
  const s = String(metin).replace(/[\s=]/g, '');
  if (!/^[A-Za-z0-9+/]*$/.test(s) || s.length % 4 === 1) return null;
  const cikti = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = TERS[s.charCodeAt(i)]; const b = TERS[s.charCodeAt(i + 1)];
    const c = i + 2 < s.length ? TERS[s.charCodeAt(i + 2)] : 0; const d = i + 3 < s.length ? TERS[s.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    cikti[o++] = (n >> 16) & 255;
    if (i + 2 < s.length) cikti[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) cikti[o++] = n & 255;
  }
  return cikti.subarray(0, o);
}

export function base64Yaz(bayt) {
  let s = '';
  for (let i = 0; i < bayt.length; i += 3) {
    const n = (bayt[i] << 16) | ((bayt[i + 1] ?? 0) << 8) | (bayt[i + 2] ?? 0);
    s += ALFABE[(n >> 18) & 63] + ALFABE[(n >> 12) & 63]
      + (i + 1 < bayt.length ? ALFABE[(n >> 6) & 63] : '=') + (i + 2 < bayt.length ? ALFABE[n & 63] : '=');
  }
  return s;
}

/** Windows yolu mu (sürücü harfi ya da UNC). */
export function windowsYolu(dosya) {
  return typeof dosya === 'string' && /^(?:[A-Za-z]:[\\/]|\\\\)/.test(dosya);
}

/**
 * Dosyanın [bas, bas+uzunluk) bayt aralığını base64 olarak stdout'a yazan komut (argv). Geçersiz girdide null.
 * Windows: PowerShell `-EncodedCommand` (UTF-16LE base64; yol ayrıca base64). Paylaşım ReadWrite+Delete: Claude Code
 * dosyaya yazmayı sürdürürken okunur. Diğerleri: `/bin/sh -c 'tail -c +N "$1" | head -c M | base64 | tr -d "\n"'`, yol konumsal argüman.
 */
export function pencereKomutu(dosya, bas, uzunluk) {
  if (typeof dosya !== 'string' || dosya.length === 0 || dosya.length > 1024 || DENETIM.test(dosya)) return null;
  if (!Number.isSafeInteger(bas) || bas < 0 || !Number.isSafeInteger(uzunluk) || uzunluk <= 0 || uzunluk > PENCERE_TAVANI) return null;
  if (windowsYolu(dosya)) {
    // Yol betik metnine GİRMEZ: PowerShell kıvrık tırnağı da tırnak sayar (tarama 2 Kas, kanıtlandı). UTF-16LE base64 olarak verilir, betikte çözülür.
    const yolBayt = new Uint8Array(dosya.length * 2);
    for (let i = 0; i < dosya.length; i += 1) { const k = dosya.charCodeAt(i); yolBayt[i * 2] = k & 255; yolBayt[i * 2 + 1] = k >> 8; }
    const yol = base64Yaz(yolBayt);
    const betik = "$ErrorActionPreference='Stop';"
      + `$p=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${yol}'));`
      + `$f=[IO.File]::Open($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete);`
      + `try{[void]$f.Seek(${bas},[IO.SeekOrigin]::Begin);$b=New-Object byte[] ${uzunluk};$t=0;`
      + `while($t -lt ${uzunluk}){$r=$f.Read($b,$t,${uzunluk}-$t);if($r -le 0){break};$t+=$r};`
      + '[Console]::Out.Write([Convert]::ToBase64String($b,0,$t))}finally{$f.Dispose()}';
    const utf16 = new Uint8Array(betik.length * 2);
    for (let i = 0; i < betik.length; i += 1) { const k = betik.charCodeAt(i); utf16[i * 2] = k & 255; utf16[i * 2 + 1] = k >> 8; }
    return ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', base64Yaz(utf16)];
  }
  return ['/bin/sh', '-c', 'tail -c +"$2" "$1" | head -c "$3" | base64 | tr -d "\\n"', 'sh', dosya, String(bas + 1), String(uzunluk)];
}

/**
 * Okunan baytlardan pencere: son LF'ye kadar TAM satırlar. Dönüş { tampon, bas, son } ya da null (LF yok).
 * LF tek bayttır ve hiçbir çok baytlı UTF-8 dizisinin içinde geçmez: kesim karakter bölmez.
 */
export function pencereKes(bayt, bas) {
  if (!bayt || bayt.length === 0) return null;
  const satirSonu = bayt.lastIndexOf(LF);
  if (satirSonu === -1) return null;
  const tam = bayt.subarray(0, satirSonu + 1);
  return { tampon: tam, bas, son: bas + tam.length };
}

/** Mesajları satır sınırında parçalara böler (04-senkron.mjs senkParcalaraBol, birebir). `_ofset` pencereye göreli. */
export function senkParcalaraBol(mesajlar, basOfset, bitisOfset, tavanMesaj, tavanBayt) {
  const mTavan = typeof tavanMesaj === 'number' && tavanMesaj > 0 ? tavanMesaj : SENK_PARCA_MESAJ;
  const bTavan = typeof tavanBayt === 'number' && tavanBayt > 0 ? tavanBayt : SENK_PARCA_BAYT;
  if (mesajlar.length === 0) return [{ bas: basOfset, son: bitisOfset, sira: null, suzulen: 0, sonMu: true, mesajlar: [] }];
  const parcalar = [];
  let birikim = [];
  let bayt = 0;
  let suzulen = 0;
  let bas = basOfset;
  for (let i = 0; i < mesajlar.length; i += 1) {
    const mesaj = mesajlar[i];
    birikim.push(mesaj);
    bayt += (mesaj.metin ? mesaj.metin.length : 0) + 240;
    suzulen += mesaj._suzulen || 0;
    const sonraki = mesajlar[i + 1];
    const satirSonu = !sonraki || sonraki._ofset !== mesaj._ofset;
    const doldu = birikim.length >= mTavan || bayt >= bTavan;
    if (satirSonu && (doldu || !sonraki)) {
      const mutlakSon = basOfset + mesaj._ofset;
      parcalar.push({ bas, son: sonraki ? mutlakSon : bitisOfset, sira: mesaj.sira + 1, suzulen, sonMu: !sonraki, mesajlar: birikim });
      bas = mutlakSon;
      birikim = [];
      bayt = 0;
      suzulen = 0;
    }
  }
  return parcalar;
}

/**
 * Her parçanın ayrıştırıcı durumu O PARÇANIN bittiği yerin durumudur (04-senkron.mjs parcaDurumlariKur, birebir; bayt dilimi TextDecoder'la).
 * `ayristir(metin, sira, durum)` → { durum }.
 */
export function parcaDurumlariKur(parcalar, ilk, pnc, basDurum, sonDurum, ayristir) {
  const coz = new TextDecoder('utf-8');
  let onceki = ilk > 0 ? parcalar[ilk - 1].durum : basDurum;
  for (let k = ilk; k < parcalar.length; k += 1) {
    const parca = parcalar[k];
    if (parca.son >= pnc.son) {
      parca.durum = sonDurum;
    } else {
      const dilim = coz.decode(pnc.tampon.subarray(parca.bas - pnc.bas, parca.son - pnc.bas));
      const sira = Number.isFinite(Number(onceki.son_sira)) ? Number(onceki.son_sira) : 0;
      parca.durum = ayristir(dilim, sira, onceki).durum;
    }
    onceki = parca.durum;
  }
}

/** Gönderilmeyen iç alanlar (`_ofset`, `_suzulen`) atılır. */
export function senkGovdesiTemizle(mesaj) {
  const kopya = {};
  for (const anahtar of Object.keys(mesaj)) {
    if (anahtar === '_ofset' || anahtar === '_suzulen') continue;
    kopya[anahtar] = mesaj[anahtar];
  }
  return kopya;
}
