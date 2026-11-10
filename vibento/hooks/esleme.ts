// =====================================================================
// eklenti/vibento/hooks/esleme.ts — eşleme akışı (3g-3; sözleşme docs/sozlesme-3g-esleme.md §1, §4, §5).
//
// Jeton yoksa: kod iste (bekleyen varsa onu kullan) → açılışta ve ilk istemlerde kullanıcı kodunu göster → arka planda yokla → `tamam`da
// jetonu `$.store`'a koy. Jeton varsa: günde bir yenile (Y-3; açılışta ve vakti gelmişse istemde). Her hata sessiz (kırmızı çizgi "hook turu asla bozmaz"): tur hiç beklemez,
// ağ hatası bir sonraki olayda yeniden denenir. Cihaz kodu ve jeton hiçbir metne, uyarıya ya da günlüğe girmez.
// =====================================================================

import type { Io } from './io.ts'
import {
  ISTEMCI, SURUM, BAGLANTI_ANAHTARI, ESLEME_ANAHTARI, YAVASLA_EK_SN, EN_KISA_ARALIK_SN, ISTEM_HATIRLATMA, baglandiSatiri,
  baslatYanitiOku, teslimYanitiOku, baglantiGecerli, bekleyenGecerli, yenilemeZamani, kodSatiri,
  cihazAdiTemizle, bekleyenYoklanabilir, yoklanacakKodlar,
  KOD_ISTEK_ARALIGI_MS, KOD_ISTEK_BUTCESI_MS, KOD_ISTEK_TAVANI, KOPMA_BILDIRIMI, KOPMA_ON_SATIRI,
} from './esleme-mantik.mjs'
import { sistemKomutu } from './senk-mantik.mjs'
import { sureli } from './olay.ts'

export type Baglanti = { token: string; baglanti_id: string; sunucu: string; alindi_at: string; yenilendi_at?: string }
type Bekleyen = {
  sunucu: string; kullanici_kodu: string; cihaz_kodu: string; bitis: string; aralik: number; dogrulama_adresi: string | null
  /** Yerine yenisi istenmiş ama kullanıcının görmüş olabileceği kod: onaylanırsa teslim alınsın. */
  onceki?: { cihaz_kodu: string; bitis: string }
}

const JSON_BASLIK = { 'content-type': 'application/json' }
const YENILEME_KILIDI = 'vibento.yenileme-kilidi'
const YARIS_BEKLEME_MS = 3_000
// A3: kurtarma denemesi pencereler arasında tek (yaklaşık kilit) ve sunucunun önceki jetonu tanıdığı süreyle sınırlı (göç 0055: 10 dakika).
const KURTARMA_KILIDI = 'vibento.kurtarma-kilidi'
const KURTARMA_KILIT_MS = 20_000
const KURTARMA_PENCERESI_MS = 600_000
// Eşleme uçlarının üst süresi: `$.http.fetch`'in belgeli zaman aşımı yok, ağ kara deliğinde açılış ve yoklama asılı kalmasın (tarama Ek 9 O6).
const AG_BUTCESI_MS = 6_000
// Başlık dosyasındaki jetonun hangi bağlantıya ait olduğu: yalnız aynı bağlantının jetonu benimsenir (tarama Ek 9 Y1). Sunucuya zararsız ek başlık.
const BAGLANTI_BASLIGI = 'X-Vibento-Baglanti'

export function eslemeKur(sunucu: string) {
  let yoklayici: { cancel(): void } | null = null
  let mesgul = false
  let bekle = 0
  let istemSayaci = 0
  let baglandiDuyur: string | null = null
  let kopmaDuyur = false
  let sonKodIstegi = 0
  let kodIstekSayisi = 0
  let kendiKod: { cihaz_kodu: string; bitis: string } | null = null
  // A3: kurtarması sonuçlanmamış (yanıt yok / başka pencere deniyor) reddedilmiş jeton ve ilk reddin zamanı; süre dolana kadar silinmez.
  let belirsiz: { token: string; ilk: number } | null = null

  async function baglantiOku(io: Io): Promise<Baglanti | null> {
    const k = await io.depoOku(BAGLANTI_ANAHTARI)
    return baglantiGecerli(k) && (k as Baglanti).sunucu === sunucu ? (k as Baglanti) : null
  }

  async function bekleyenOku(io: Io): Promise<Bekleyen | null> {
    const b = await io.depoOku(ESLEME_ANAHTARI)
    return bekleyenGecerli(b, sunucu, Date.now()) ? (b as Bekleyen) : null
  }

  async function cihazAdi(io: Io): Promise<string | null> {
    const oku = async (komut: string[]) => {
      try {
        const r = await io.komut(komut, 3_000)
        return r.exitCode === 0 ? cihazAdiTemizle(r.stdout) : null
      } catch {
        return null
      }
    }
    // Mac'te `hostname` iç ağ adresi dönebiliyor: o zaman bilgisayarın kendi adı (yoksa adsız, kart "Adı bildirilmemiş cihaz" der).
    const kok = await io.sistemKlasoru().catch(() => null)
    return (await oku([sistemKomutu(kok, 'hostname.exe', 'hostname')])) ?? (kok ? null : await oku(['scutil', '--get', 'ComputerName']))
  }

  async function kodIste(io: Io): Promise<Bekleyen | null> {
    const y = await sureli(io, AG_BUTCESI_MS, io.istek(`${sunucu}/api/esleme/baslat`, {
      method: 'POST',
      headers: JSON_BASLIK,
      body: JSON.stringify({ istemci: ISTEMCI, surum: SURUM, cihaz_adi: await cihazAdi(io) }),
    }))
    if (!y) return null
    const r = baslatYanitiOku(y.status, y.text, sunucu)
    if (r.tur !== 'kod') return null
    const eski = await io.depoOku(ESLEME_ANAHTARI)
    const b: Bekleyen = {
      sunucu, kullanici_kodu: r.kullanici_kodu, cihaz_kodu: r.cihaz_kodu, bitis: r.bitis, aralik: r.aralik, dogrulama_adresi: r.dogrulama_adresi,
      ...(bekleyenYoklanabilir(eski, sunucu, Date.now()) ? { onceki: { cihaz_kodu: (eski as Bekleyen).cihaz_kodu, bitis: (eski as Bekleyen).bitis } } : {}),
    }
    await io.depoYaz(ESLEME_ANAHTARI, b)
    kendiKod = { cihaz_kodu: b.cihaz_kodu, bitis: b.bitis }
    return b
  }

  // MCP araçlarının kimliği (DECISIONS 2 Kas ③ Ek 2): `headersHelper` komutu bu dosyayı basar; jeton değişince dosya da değişir, araçlar kopmaz.
  // Yol sabit (`~/.vibento/`): eklentinin kök klasörü güncellemede değişir, kullanıcı düzeyi MCP tanımı da aynı dosyayı okur. Jeton yoksa `{}`.
  // Değer yalnız bu dosyaya gider (bugünkü `~/.vibento/baglanti.json` ile aynı duruş); hiçbir metne ya da günlüğe girmez. Hata sessiz.
  async function baslikYaz(io: Io, k: { token: string; baglanti_id: string } | null) {
    try {
      const ev = await io.evKlasoru()
      if (!ev) return
      const a = ev.includes('\\') ? '\\' : '/'
      const yol = `${ev}${a}.vibento${a}mcp-baslik.json`
      await io.dosyaYaz(yol, JSON.stringify(k ? { Authorization: `Bearer ${k.token}`, [BAGLANTI_BASLIGI]: k.baglanti_id } : {}))
      if (a === '/') await io.komut(['chmod', '600', yol], 3_000).catch(() => null)
    } catch {
      // araçlar bir sonraki açılışa kalır; tur bozulmaz
    }
  }

  // Reddedilen jeton hâlâ depodaki mi? Başka pencere yenilediyse başlık dosyasında daha yeni jeton vardır: onu benimse, silme. Depo süreç içinde
  // önbellekli olabilir (ölçülmedi); dosya her zaman tazedir. Dosya ev klasöründe tek, depo ayar klasöründe: başka profilin ya da yabancı bir jeton
  // benimsenmez, kayıtlar başka hesaba akardı (tarama Ek 9 Y1).
  async function yeniJeton(io: Io, reddedilen: string): Promise<string | null> {
    try {
      const depo = await baglantiOku(io)
      if (depo && depo.token !== reddedilen) return depo.token
      const ev = await io.evKlasoru()
      if (ev && depo) {
        const a = ev.includes('\\') ? '\\' : '/'
        const m = await io.dosyaOku(`${ev}${a}.vibento${a}mcp-baslik.json`).catch(() => null)
        const baslik = m ? (JSON.parse(m) as Record<string, unknown>) : null
        const dosya = baslik?.Authorization
        const yeni = typeof dosya === 'string' && dosya.startsWith('Bearer ') ? dosya.slice(7) : null
        if (yeni && yeni !== reddedilen && baslik?.[BAGLANTI_BASLIGI] === depo.baglanti_id && baglantiGecerli({ ...depo, token: yeni })) {
          await io.depoYaz(BAGLANTI_ANAHTARI, { ...depo, token: yeni, yenilendi_at: new Date().toISOString() })
          return yeni
        }
      }
    } catch {
      // okunamadı: silme yoluna düşer
    }
    return null
  }

  // A3 (0.1.23; sunucu göç 0055): yenileme yanıtı kaybolduysa yeni jeton hiçbir yerde yoktur, eldeki jeton 401 alır. Sunucu önceki jetonu
  // 10 dakika, yalnız yenileme ucunda ve yeni jeton hiç kullanılmadıysa tanır: silmeden önce bir kez o uçtan yeni jeton istenir.
  // 'red': sunucu tanımadı (gerçek iptal ya da süre doldu) → silinir. 'belirsiz': yanıt yok, sunucu hatası ya da başka pencere deniyor → silinmez.
  async function kurtar(io: Io, reddedilen: string): Promise<{ tur: 'tamam'; token: string } | { tur: 'red' } | { tur: 'belirsiz' }> {
    try {
      const depo = await baglantiOku(io)
      if (!depo) return { tur: 'red' }
      // İki okuma arasında başka pencere yazdı: onun jetonu benimsenir, silinmez.
      if (depo.token !== reddedilen) return { tur: 'tamam', token: depo.token }
      const kilit = Number(await io.depoOku(KURTARMA_KILIDI))
      if (Number.isFinite(kilit) && Date.now() - kilit < KURTARMA_KILIT_MS) return { tur: 'belirsiz' }
      await io.depoYaz(KURTARMA_KILIDI, Date.now())
      const y = await sureli(io, AG_BUTCESI_MS, io.istek(`${sunucu}/api/esleme/yenile`, {
        method: 'POST', headers: { ...JSON_BASLIK, authorization: `Bearer ${reddedilen}` }, body: '{}',
      }))
      if (!y) return { tur: 'belirsiz' }
      if (y.status === 401) return { tur: 'red' }
      if (!y.ok) return { tur: 'belirsiz' }
      const v = JSON.parse(y.text) as { ok?: boolean; token?: unknown }
      const yeni = { ...depo, token: String(v.token ?? ''), yenilendi_at: new Date().toISOString() }
      if (v.ok !== true || !baglantiGecerli(yeni) || yeni.token === reddedilen) return { tur: 'belirsiz' }
      await io.depoYaz(BAGLANTI_ANAHTARI, yeni)
      await baslikYaz(io, yeni)
      return { tur: 'tamam', token: yeni.token }
    } catch {
      return { tur: 'belirsiz' }
    }
  }

  // Dönüş: geçerli yeni jeton, ya da null (bağlantı silindi ya da kurtarma belirsiz kaldı; çağıran ikisinde de bu olayı bırakır). 401 dört sebepten
  // gelir: iptal, hareketsizlik, başka pencerenin yenilemesi, kaybolan yenileme yanıtı (A3). Kazanan pencere yanıtını henüz yazmamış olabilir (kilit
  // tam atomik değil, ㉕ E1): önce bak, yoksa bekle, yine bak; sonra sunucudan kurtarmayı dene (`kurtarmaDene`; yenileme ucunun kendi 401'inde
  // denenmez, aynı uç az önce reddetti); ancak o zaman sil.
  async function reddedildi(io: Io, reddedilen: string, kurtarmaDene = true): Promise<string | null> {
    const hemen = await yeniJeton(io, reddedilen)
    if (hemen) return hemen
    // Belirsiz kalan jetonda her olay yeniden 3 sn beklemez: yarış beklemesi jeton başına bir kez.
    const bekleyen = belirsiz?.token === reddedilen ? belirsiz : null
    if (!bekleyen) {
      await new Promise<void>((bitti) => { io.sonra(YARIS_BEKLEME_MS, bitti) })
      const sonra = await yeniJeton(io, reddedilen)
      if (sonra) return sonra
    }
    if (kurtarmaDene) {
      const k = await kurtar(io, reddedilen)
      if (k.tur === 'tamam') { belirsiz = null; return k.token }
      if (k.tur === 'belirsiz') {
        // Sunucunun tanıma süresi kadar beklenir; o süre dolduysa kurtarma artık geçmez, bağlantı silinir.
        const ilk = bekleyen?.ilk ?? Date.now()
        if (Date.now() - ilk < KURTARMA_PENCERESI_MS) { belirsiz = { token: reddedilen, ilk }; return null }
      }
    }
    belirsiz = null
    // Kurtarma sürerken (≤ 6 sn) başka pencere geçerli bir jeton yazmış olabilir: silmeden önce son kez bak (tarama 10 Kas bulgu 3).
    const sonBakis = await yeniJeton(io, reddedilen)
    if (sonBakis) return sonBakis
    await io.depoSil(BAGLANTI_ANAHTARI)
    await baslikYaz(io, null)
    kopmaDuyur = true
    try { io.bildir(KOPMA_BILDIRIMI) } catch { /* bildirim yoksa sonraki istemde satır gelir */ }
    return null
  }

  function durdur() {
    yoklayici?.cancel()
    yoklayici = null
    bekle = 0
  }

  async function yokla(io: Io) {
    if (mesgul) return
    if (bekle > 0) { bekle -= 1; return }
    mesgul = true
    try {
      if (await baglantiOku(io)) { durdur(); kendiKod = null; baglandiDuyur = baglandiSatiri(null, null); return }
      // Gösterilmeyen kod da yoklanır: kullanıcı son dakikada yazdıysa sunucu onaylı kodu bitişten sonra da teslim eder.
      const ham = await io.depoOku(ESLEME_ANAHTARI)
      const b = bekleyenYoklanabilir(ham, sunucu, Date.now()) ? (ham as Bekleyen) : null
      const kodlar = yoklanacakKodlar(b, Date.now(), kendiKod)
      if (kodlar.length === 0) { durdur(); return }
      for (const cihazKodu of kodlar) {
        const asil = cihazKodu === b?.cihaz_kodu
        const y = await sureli(io, AG_BUTCESI_MS, io.istek(`${sunucu}/api/esleme/jeton`, {
          method: 'POST', headers: JSON_BASLIK, body: JSON.stringify({ cihaz_kodu: cihazKodu }),
        }))
        if (!y) return
        const r = teslimYanitiOku(y.status, y.text)
        if (r.tur === 'tamam') {
          const simdi = new Date().toISOString()
          await io.depoYaz(BAGLANTI_ANAHTARI, { token: r.token, baglanti_id: r.baglanti_id, sunucu, alindi_at: simdi } satisfies Baglanti)
          await io.depoSil(ESLEME_ANAHTARI)
          kendiKod = null
          await baslikYaz(io, { token: r.token, baglanti_id: r.baglanti_id })
          try { await io.mcpBagla() } catch { /* sonraki açılışta bağlanır */ }
          durdur()
          baglandiDuyur = baglandiSatiri(r.hesap_ad, r.eposta_maskeli)
          io.bildir(baglandiDuyur)
          return
        }
        if (r.tur === 'yavasla') {
          bekle = Math.ceil(YAVASLA_EK_SN / Math.max(1, b?.aralik ?? EN_KISA_ARALIK_SN))
        } else if (r.tur === 'bitti' || (r.tur === 'zaten_teslim' && !(await baglantiOku(io)))) {
          // Bu kod artık alınamaz. Yalnız o kod düşer: eski kodun sonucu depodaki canlı kodu silmez (tarama Ek 9 D3). `zaten_teslim` ve depo doluysa
          // jetonu başka pencere aldı; depo bir sonraki yoklamada okunur.
          if (cihazKodu === kendiKod?.cihaz_kodu) kendiKod = null
          if (asil) {
            await io.depoSil(ESLEME_ANAHTARI)
            if (!kendiKod) { durdur(); return }
          } else if (b && cihazKodu === b.onceki?.cihaz_kodu) {
            const { onceki: _onceki, ...kalan } = b
            await io.depoYaz(ESLEME_ANAHTARI, kalan)
          }
        }
      }
    } catch {
      // ağ yok: bir sonraki periyotta yeniden
    } finally {
      mesgul = false
    }
  }

  function yoklamaBaslat(io: Io, b: Bekleyen) {
    if (yoklayici) return
    yoklayici = io.herBirde(b.aralik * 1000, () => { void yokla(io) })
  }

  // Y4 (tarama 2 Kas): birkaç pencere aynı anda açılınca aynı eski jetonla yenileyebilir; kazanan dışındakiler 401 alır. Kilit yenilemeyi tek
  // pencereye indirir; 401 yalnız depodaki jeton HÂLÂ reddedilen jetonsa silme sayılır (jetonReddedildi).
  async function jetonYenile(io: Io, k: Baglanti) {
    if (!yenilemeZamani(k, Date.now())) return
    try {
      const kilit = Number(await io.depoOku(YENILEME_KILIDI))
      if (Number.isFinite(kilit) && Date.now() - kilit < 120_000) return
      // Başka pencere aynı jetonu kurtarıyorsa araya ikinci bir döndürme sokma (tarama 10 Kas bulgu 3).
      const kurtarma = Number(await io.depoOku(KURTARMA_KILIDI))
      if (Number.isFinite(kurtarma) && Date.now() - kurtarma < KURTARMA_KILIT_MS) return
      await io.depoYaz(YENILEME_KILIDI, Date.now())
      const y = await sureli(io, AG_BUTCESI_MS, io.istek(`${sunucu}/api/esleme/yenile`, {
        method: 'POST', headers: { ...JSON_BASLIK, authorization: `Bearer ${k.token}` }, body: '{}',
      }))
      if (!y) return
      if (y.status === 401) {
        await reddedildi(io, k.token, false)
        return
      }
      if (!y.ok) return
      const v = JSON.parse(y.text) as { ok?: boolean; token?: unknown }
      const yeni = { ...k, token: String(v.token ?? ''), yenilendi_at: new Date().toISOString() }
      if (v.ok === true && baglantiGecerli(yeni)) { await io.depoYaz(BAGLANTI_ANAHTARI, yeni); await baslikYaz(io, yeni) }
    } catch {
      // sonraki açılışta yeniden
    }
  }

  return {
    baglantiOku,

    /** Açılış: bağlıysa jetonu gerekiyorsa yeniler ve null döner; değilse kodu hazırlar, yoklamayı başlatır, gösterilecek satırı döner. */
    async acilis(io: Io): Promise<string | null> {
      try {
        const k = await baglantiOku(io)
        if (k) {
          await baslikYaz(io, k)
          await jetonYenile(io, k)
          if (await baglantiOku(io)) return null
          // Yenileme ucu 401 verdi, bağlantı silindi: neden ve kod bu açılışta.
          return await this.istem(io)
        }
        const b = (await bekleyenOku(io)) ?? (await kodIste(io))
        if (!b) return null
        yoklamaBaslat(io, b)
        istemSayaci = 0
        return kodSatiri(b, Date.now())
      } catch {
        return null
      }
    },

    /**
     * İstem: bağlandıysa bir kez "bağlandı"; bağlı değilse kod satırı. Kod yoksa ya da süresi dolduysa açık konuşmada da yeni kod istenir
     * (2 Kas: eski kod aynı konuşmada döngüye giriyordu). Bağlantı koptuysa başına bir kez neden yazılır.
     */
    async istem(io: Io): Promise<string | null> {
      try {
        if (baglandiDuyur) { const s = baglandiDuyur; baglandiDuyur = null; return s }
        const bagli = await baglantiOku(io)
        if (bagli) {
          // Y-3: pencere günlerce açık kalabilir; günlük yenileme yalnız açılışa bağlı kalmaz, vakti gelmişse istemde de yapılır (kilitli, ≤ 6 sn, günde bir).
          if (!yenilemeZamani(bagli, Date.now())) return null
          await jetonYenile(io, bagli)
          if (await baglantiOku(io)) return null
          // Yenileme ucu 401 verdi, bağlantı silindi: aşağıda kod istenir.
        }
        let b = await bekleyenOku(io)
        const simdi = await io.simdi()
        if (!b && kodIstekSayisi < KOD_ISTEK_TAVANI && simdi - sonKodIstegi >= KOD_ISTEK_ARALIGI_MS) {
          sonKodIstegi = simdi
          kodIstekSayisi += 1
          // Tur beklemez: yanıt geç gelirse depoya yine yazılır, sonraki istemde görünür.
          b = await sureli(io, KOD_ISTEK_BUTCESI_MS, kodIste(io))
          if (b) istemSayaci = 0
        }
        const kopma = kopmaDuyur ? KOPMA_ON_SATIRI : null
        kopmaDuyur = false
        if (!b) return kopma
        yoklamaBaslat(io, b)
        istemSayaci += 1
        const satir = istemSayaci <= ISTEM_HATIRLATMA ? kodSatiri(b, Date.now()) : null
        return [kopma, satir].filter(Boolean).join(' ') || null
      } catch {
        return null
      }
    },

    /** Sunucu jetonu reddetti (401): başka pencere yenilemediyse sil, kopmayı duyur; sonraki istem (ya da bu açılış) yeni kod ister. */
    jetonReddedildi: (io: Io, reddedilen: string) => reddedildi(io, reddedilen),

    durdur,
  }
}
