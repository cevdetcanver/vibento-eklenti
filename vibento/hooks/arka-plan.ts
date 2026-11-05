// =====================================================================
// eklenti/vibento/hooks/arka-plan.ts — arka plan pencereler: sunucudan iş al, kapalı konuşmayı görünür pencere açmadan sürdür
// (sözleşme docs/sozlesme-arka-plan-pencere.md §4). Kurallar arka-plan-mantik.mjs'te; burada yalnız io bağlantısı.
//
// Kırmızı çizgi: hiçbir hata turu bozmaz; yoklama ve koşu kendi zamanlayıcısında, kancanın dönüşünü bekletmez. Açık pencereye
// dokunulmaz (makinedeki açık oturum kaydı + canlı süreç; emin olunamıyorsa dokunulmaz). Süre tavanı ayrı bir zamanlayıcıyla uygulanır
// ve süreci öldürür (çıktı turun sonunda geldiği için parça beklenmez). Çocuk süreç modül kapanınca ölür; iş kirası biter, sunucu bir
// kez daha verir.
// =====================================================================

import type { Io, Surec } from './io.ts'
import type { Istek, SenkOzeti } from './senk.ts'
import {
  ES_ZAMANLI_TAVAN, IKILI_KLASORLERI, KAPALI_BEKLEME_MS, KAPALI_DOSYASI, KIRA_YENILEME_MS, OTURUM_KLASORU, TUR_SURE_TAVANI_MS, YOKLAMA_MS, YOKLAYAN_DOSYASI,
  KIMLIK_KAYDI, acikOturumlar, argumanlar, bitisGovdesi, bitisKarari, ciktiEkle, ikiliAdaylari, isGecerli, istemSec, kimlikKaydiBudama, ortamEkleri, pidCanli, pidKomutu,
  silinecekMi, silmeKomutu, sonucAyristir, transkriptAdaylari, yerelIkililer, yoklayanKarari,
} from './arka-plan-mantik.mjs'
import { BAGLANTI_ANAHTARI, SURUM } from './esleme-mantik.mjs'

type Is = { id: string; tur: string; klasor: string; dis_seans_id: string; ad: string; model: string; tur_usd: number; butce_usd: number; amac?: string | null; yeni_konusma?: boolean }
type Zamanlayici = { cancel(): void }
/** senk.ts `senkYap`: eşitlemeyi kendisi koşturur ve son ofseti döner (silme kanıtı). */
export type SenkYap = (io: Io, token: string, dosya: unknown, disSeansId: unknown, cwd: unknown, butceMs: number) => Promise<SenkOzeti>

/** Hafif kimliğin yerelde var olan transkriptleri (`~/.claude/projects/<klasör>/<kimlik>.jsonl`); klasör adları diskten, kimlik UUID (transkriptAdaylari). */
export async function yerelTranskriptler(io: Io, kimlik: string): Promise<{ windows: boolean; var: { dosya: string; klasor: string }[] }> {
  const ev = await io.evKlasoru()
  if (!ev) return { windows: false, var: [] }
  const windows = (await io.sistemKlasoru()) !== null
  let klasorler: { name: string; kind: string }[] = []
  try { klasorler = await io.dizin(`${ev}/.claude/projects`) } catch { return { windows, var: [] } }
  const out: { dosya: string; klasor: string }[] = []
  for (const aday of transkriptAdaylari(ev, klasorler.filter((k) => k.kind !== 'file').map((k) => k.name), kimlik)) {
    if ((await io.dosyaBoyu(aday.dosya)) !== null) out.push(aday)
  }
  return { windows, var: out }
}

/**
 * D1 (0052, tarama 4): kendi açtığı hafif konuşmanın yerel transkriptini EŞİTLEME KANITINDAN sonra siler: önce eşitlemeyi kendisi koşturur (Stop kancası
 * beklemeden başlatır, süreç kapanınca kalan kısım gidemeyebilir), sunucu ofseti dosya boyuna eşitse dosya ve varsa `<kimlik>/` klasörü silinir. Kimlik
 * yalnız yerel kayıttaki (bizim) ve makinede açık olmayan; yol izin listesine uymazsa silinmez; silme kabuksuz argv; hata sessiz, dosya kalır.
 * Dönüş: silinen dosya sayısı.
 */
export async function transkriptSil(io: Io, senkYap: SenkYap | undefined, token: string, kimlik: string, klasor: string, bizim: boolean, acik: boolean): Promise<number> {
  let silinen = 0
  try {
    if (!senkYap || !bizim || acik) return 0
    const { windows, var: dosyalar } = await yerelTranskriptler(io, kimlik)
    for (const aday of dosyalar) {
      const ozet = await senkYap(io, token, aday.dosya, kimlik, klasor, 20_000)
      const boy = await io.dosyaBoyu(aday.dosya)
      if (ozet.hata !== null || !silinecekMi({ tur: 'hafif', bizim, acik, ofset: ozet.ofset, boy })) continue
      const dosyaKomutu = silmeKomutu(windows, aday.dosya, false)
      if (!dosyaKomutu) continue
      try { await io.komut(dosyaKomutu, 5_000) } catch { continue }
      if ((await io.dosyaBoyu(aday.dosya)) !== null) continue // silinemedi (VS Code dosyayı tutuyor olabilir): dosya kalır, sessiz
      silinen += 1
      let klasorVar = false
      try { await io.dizin(aday.klasor); klasorVar = true } catch { klasorVar = false }
      const klasorKomutu = klasorVar ? silmeKomutu(windows, aday.klasor, true) : null
      if (klasorKomutu) { try { await io.komut(klasorKomutu, 5_000) } catch { /* klasör kalır */ } }
    }
  } catch {
    // silme turu bozmaz
  }
  return silinen
}

export function arkaPlanKur(istek: Istek, senkYap?: SenkYap) {
  let saat: Zamanlayici | null = null
  let aktif = false
  let kapaliyaKadar = 0
  const kosanlar = new Map<string, () => void>()

  /** Y-3 (0.1.19): jeton günde bir değişir ve eski jeton anında ölür; çalıştırıcı açılışta aldığı jetonu değil depodaki güncel jetonu kullanır. Depo okunamazsa açılıştaki. */
  async function jeton(io: Io, yedek: string): Promise<string> {
    try {
      const k = (await io.depoOku(BAGLANTI_ANAHTARI)) as { token?: unknown } | null
      return typeof k?.token === 'string' && k.token.length > 0 ? k.token : yedek
    } catch {
      return yedek
    }
  }

  const bitir = async (io: Io, token: string, govde: Record<string, unknown>) =>
    istek(io, await jeton(io, token), '/api/pencere-isi/bitir', 'POST', govde, 8_000)
  const kisaBitir = (io: Io, token: string, id: string, durum: string, hata: string | null) =>
    bitir(io, token, { id, durum, hata, toplam_usd: null, kullanim: null, model: null, sure_ms: null })

  /** Konuşma bu makinede açık mı: oturum kaydı + canlı süreç. Emin olunamıyorsa açık sayılır (dokunulmaz). */
  async function acikMi(io: Io, disSeansId: string): Promise<boolean> {
    const ev = await io.evKlasoru()
    if (!ev) return true
    const klasor = `${ev}/${OTURUM_KLASORU}`
    let dosyalar: { name: string }[] = []
    try { dosyalar = await io.dizin(klasor) } catch { return true }
    const icerikler: string[] = []
    for (const d of dosyalar) {
      if (!d.name.endsWith('.json')) continue
      try { icerikler.push(await io.dosyaOku(`${klasor}/${d.name}`)) } catch { /* okunamayan kayıt */ }
    }
    const aday = acikOturumlar(icerikler).find((o) => o.sessionId === disSeansId)
    if (!aday) return false
    const windows = (await io.sistemKlasoru()) !== null
    try {
      const r = await io.komut(pidKomutu(windows, aday.pid), 5_000)
      return pidCanli(windows, aday.pid, r.stdout)
    } catch {
      return true
    }
  }

  /** Kendi açtığı hafif kimliklerin yerel kaydı (sahiplik kanıtı; tarama 4 bulgu 2). Okunamazsa boş: silme yapılmaz. */
  async function kimlikKaydiOku(io: Io): Promise<Record<string, number>> {
    try { return kimlikKaydiBudama(await io.depoOku(KIMLIK_KAYDI), await io.simdi()) } catch { return {} }
  }
  async function kimlikKaydet(io: Io, kimlik: string) {
    try { const k = await kimlikKaydiOku(io); k[kimlik] = await io.simdi(); await io.depoYaz(KIMLIK_KAYDI, k) } catch { /* kayıt yazılamazsa silme yapılmaz */ }
  }
  async function kimlikSil(io: Io, kimlik: string) {
    try { const k = await kimlikKaydiOku(io); delete k[kimlik]; await io.depoYaz(KIMLIK_KAYDI, k) } catch { /* kayıt kalır, 24 saatte düşer */ }
  }

  /** Claude ikilisi: önce ortam değişkeni; yoksa uzantı klasörleri (bu işletim sisteminin en yeni sürümü), sonra yerel kurulum. 5 Kas canlı
   *  deneme: Panel penceresinde `$.env.get('CLAUDE_CODE_EXECPATH')` boş döndü ve iş `ikili_yok` ile düştü; yol artık diskten bulunur. */
  async function ikiliBul(io: Io): Promise<string | null> {
    try { const e = await io.ortam?.('CLAUDE_CODE_EXECPATH'); if (typeof e === 'string' && e.length > 0) return e } catch { /* ortam okunamadı */ }
    const ev = await io.evKlasoru()
    if (!ev) return null
    const windows = (await io.sistemKlasoru()) !== null
    for (const k of IKILI_KLASORLERI) {
      let girdiler: { name: string }[] = []
      try { girdiler = await io.dizin(`${ev}/${k}`) } catch { continue }
      for (const yol of ikiliAdaylari(`${ev}/${k}`, girdiler, windows)) {
        if ((await io.dosyaBoyu(yol)) !== null) return yol
      }
    }
    for (const yol of yerelIkililer(ev, windows)) if ((await io.dosyaBoyu(yol)) !== null) return yol
    return null
  }

  async function kos(io: Io, token: string, is: Is) {
    const bas = await io.simdi()
    kosanlar.set(is.id, () => {})
    let kira: Zamanlayici | null = null
    let bekci: Zamanlayici | null = null
    try {
      if (await acikMi(io, is.dis_seans_id)) { await kisaBitir(io, token, is.id, 'atlandi', 'acik'); return }
      const ikili = await ikiliBul(io)
      if (!ikili || !io.surec) {
        await kisaBitir(io, token, is.id, 'hata', ikili ? 'surec_yok' : 'ikili_yok')
        if (!ikili) { try { io.bildir('Vibento: arka plan turu için Claude ikilisi bulunamadı (ortam değişkeni ve uzantı klasörü yok).') } catch { /* görünüm */ } }
        return
      }
      try { await io.dizin(is.klasor) } catch { await kisaBitir(io, token, is.id, 'hata', 'klasor_yok'); return }
      // D1 (0052, tarama 4): hafif kimliğin sahipliği yerel kayıtla kanıtlanır. Yerelde dosyası olan YABANCI kimlik koşulmaz ve asla silinmez (ele geçirilmiş
      // sunucu insanın konuşmasını hedef gösteremez); kendi dosyamız varsa (kira bitmiş yeniden koşu) --resume ile sürer.
      let bizim = false
      let devamEt = false
      if (is.tur === 'hafif') {
        const kayit = await kimlikKaydiOku(io)
        bizim = Object.prototype.hasOwnProperty.call(kayit, is.dis_seans_id)
        const yerel = await yerelTranskriptler(io, is.dis_seans_id)
        if (yerel.var.length > 0 && !bizim) { await kisaBitir(io, token, is.id, 'hata', 'kimlik_dolu'); return }
        devamEt = yerel.var.length > 0
        if (!bizim) { await kimlikKaydet(io, is.dis_seans_id); bizim = true }
      }
      const akis: Surec = io.surec(argumanlar(is, ikili, istemSec(is), { devamEt }), is.klasor, ortamEkleri())
      const it = typeof akis[Symbol.asyncIterator] === 'function' ? (akis[Symbol.asyncIterator] as () => Surec)() : akis
      let kesildi = false
      const durdur = () => { kesildi = true; kira?.cancel(); kira = null; void it.return?.() }
      kosanlar.set(is.id, durdur)
      // Süre tavanı çıktıdan bağımsız: parça gelmese de dolunca süreç ölür, kira uzamaz.
      bekci = io.sonra(TUR_SURE_TAVANI_MS, durdur)
      kira = io.herBirde(KIRA_YENILEME_MS, () => { if (!kesildi) void jeton(io, token).then((t) => istek(io, t, '/api/pencere-isi/kira', 'POST', { id: is.id }, 8_000)) })
      let cikti = ''
      let kod: number | null = null
      for (;;) {
        const r = await it.next()
        if (r.done) { kod = r.value?.code ?? null; break }
        if (r.value?.stream === 'stdout') cikti = ciktiEkle(cikti, r.value.text)
      }
      const sonuc = sonucAyristir(cikti, is.model)
      const karar = bitisKarari({ kesildi, kod, sonuc })
      await bitir(io, token, bitisGovdesi(is.id, karar, sonuc, (await io.simdi()) - bas))
      // D1 (0052, tarama 4): hafif konuşma tek kullanımlık; eşitleme kendimiz koşturulup kanıtlanınca (ofset = boy) yerel transkript silinir, kayıt düşer.
      // Bu blok kendi başına korunur: silme hatası "başlatılamadı" bildirimine dönüşmez (tarama 4 bulgu 7).
      if (is.tur === 'hafif' && bizim) {
        try {
          const acik = await acikMi(io, is.dis_seans_id)
          const silinen = await transkriptSil(io, senkYap, await jeton(io, token), is.dis_seans_id, is.klasor, bizim, acik)
          if (silinen > 0) await kimlikSil(io, is.dis_seans_id)
        } catch { /* silme turu bozmaz */ }
      }
    } catch {
      try { await kisaBitir(io, token, is.id, 'hata', 'calistirici') } catch { /* ağ yok */ }
      try { io.bildir('Vibento: arka plan pencere başlatılamadı; sunucu bir kez daha dener.') } catch { /* görünüm */ }
    } finally {
      bekci?.cancel()
      kira?.cancel()
      kosanlar.delete(is.id)
    }
  }

  async function yokla(io: Io, token: string, oturum: string) {
    if (!aktif) return
    try {
      const simdi = await io.simdi()
      if (simdi < kapaliyaKadar) return
      const ev = await io.evKlasoru()
      if (!ev) return
      // Bilgisayar başına kapatma: dosya varsa bu makine hiç yoklamaz (hesap ayarından bağımsız).
      if ((await io.dosyaBoyu(`${ev}/${KAPALI_DOSYASI}`)) !== null) return
      const yol = `${ev}/${YOKLAYAN_DOSYASI}`
      let kayit: unknown = null
      try { kayit = JSON.parse(await io.dosyaOku(yol)) } catch { kayit = null }
      const karar = yoklayanKarari(kayit, oturum, simdi, SURUM)
      if (!karar.yokla) return
      if (karar.yaz) { try { await io.dosyaYaz(yol, JSON.stringify({ oturum, at: new Date(simdi).toISOString(), surum: SURUM })) } catch { /* yazılamazsa yine yoklar */ } }
      if (kosanlar.size >= ES_ZAMANLI_TAVAN) return
      const y = await istek(io, await jeton(io, token), '/api/pencere-isi/yokla', 'POST', { dis_seans_id: oturum, turler: ['yeni', 'devam', 'hafif'] }, 8_000)
      if (!y.ok || y.govde?.ok !== true) return
      if (y.govde.acik === false) { kapaliyaKadar = simdi + KAPALI_BEKLEME_MS; return }
      const is = y.govde.is
      if (!isGecerli(is)) {
        // Alınmış iş kilitli kalmasın (tarama 2 O-6): hemen hata ile kapat; kimlik bile yoksa sessiz.
        const kimlik = is && typeof (is as { id?: unknown }).id === 'string' ? String((is as { id: string }).id) : null
        if (kimlik) { try { await kisaBitir(io, token, kimlik, 'hata', 'gecersiz_is') } catch { /* ağ */ } }
        return
      }
      void kos(io, token, is as Is)
    } catch {
      // yoklama turu bozmaz; sonraki aralıkta yeniden
    }
  }

  return {
    /** Açılışta bir kez: arka plan oturumunun kendisi yoklamaz (özyineleme yok). */
    async basla(io: Io, token: string, oturum: unknown) {
      if (typeof oturum !== 'string' || aktif) return
      try { if (await io.ortam?.('VIBENTO_ARKA_PLAN')) return } catch { return }
      aktif = true
      saat = io.herBirde(YOKLAMA_MS, () => { void yokla(io, token, oturum) })
    },
    durdur() {
      aktif = false
      saat?.cancel()
      saat = null
      for (const d of kosanlar.values()) d()
      kosanlar.clear()
    },
  }
}
