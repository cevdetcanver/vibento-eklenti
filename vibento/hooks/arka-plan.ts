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
import type { Istek } from './senk.ts'
import {
  ES_ZAMANLI_TAVAN, IKILI_KLASORLERI, KAPALI_BEKLEME_MS, KAPALI_DOSYASI, KIRA_YENILEME_MS, OTURUM_KLASORU, TUR_SURE_TAVANI_MS, YOKLAMA_MS, YOKLAYAN_DOSYASI,
  acikOturumlar, argumanlar, bitisGovdesi, bitisKarari, ciktiEkle, ikiliAdaylari, isGecerli, ortamEkleri, pidCanli, pidKomutu, sonucAyristir, yerelIkililer, yoklayanKarari,
} from './arka-plan-mantik.mjs'

type Is = { id: string; tur: string; klasor: string; dis_seans_id: string; ad: string; model: string; tur_usd: number; butce_usd: number }
type Zamanlayici = { cancel(): void }

export function arkaPlanKur(istek: Istek) {
  let saat: Zamanlayici | null = null
  let aktif = false
  let kapaliyaKadar = 0
  const kosanlar = new Map<string, () => void>()

  const bitir = (io: Io, token: string, govde: Record<string, unknown>) =>
    istek(io, token, '/api/pencere-isi/bitir', 'POST', govde, 8_000)
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
      const akis: Surec = io.surec(argumanlar(is, ikili), is.klasor, ortamEkleri())
      const it = typeof akis[Symbol.asyncIterator] === 'function' ? (akis[Symbol.asyncIterator] as () => Surec)() : akis
      let kesildi = false
      const durdur = () => { kesildi = true; kira?.cancel(); kira = null; void it.return?.() }
      kosanlar.set(is.id, durdur)
      // Süre tavanı çıktıdan bağımsız: parça gelmese de dolunca süreç ölür, kira uzamaz.
      bekci = io.sonra(TUR_SURE_TAVANI_MS, durdur)
      kira = io.herBirde(KIRA_YENILEME_MS, () => { if (!kesildi) void istek(io, token, '/api/pencere-isi/kira', 'POST', { id: is.id }, 8_000) })
      let cikti = ''
      let kod: number | null = null
      for (;;) {
        const r = await it.next()
        if (r.done) { kod = r.value?.code ?? null; break }
        if (r.value?.stream === 'stdout') cikti = ciktiEkle(cikti, r.value.text)
      }
      const sonuc = sonucAyristir(cikti)
      const karar = bitisKarari({ kesildi, kod, sonuc })
      await bitir(io, token, bitisGovdesi(is.id, karar, sonuc, (await io.simdi()) - bas))
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
      const karar = yoklayanKarari(kayit, oturum, simdi)
      if (!karar.yokla) return
      if (karar.yaz) { try { await io.dosyaYaz(yol, JSON.stringify({ oturum, at: new Date(simdi).toISOString() })) } catch { /* yazılamazsa yine yoklar */ } }
      if (kosanlar.size >= ES_ZAMANLI_TAVAN) return
      const y = await istek(io, token, '/api/pencere-isi/yokla', 'POST', { dis_seans_id: oturum }, 8_000)
      if (!y.ok || y.govde?.ok !== true) return
      if (y.govde.acik === false) { kapaliyaKadar = simdi + KAPALI_BEKLEME_MS; return }
      const is = y.govde.is
      if (!isGecerli(is)) return
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
