// =====================================================================
// eklenti/vibento/hooks/kart.tsx — pencere kartlarının çizimi (docs/sozlesme-pencere-kartlari.md).
//
// Yalnız görünüm: kayıt değişmez. Anahtar kapalıysa, çizilecek bir şey yoksa ya da herhangi bir hatada satıra dokunulmaz.
// Bant kimden geldiğini (iş rengi), kırmızı senden bir şey istendiğini söyler. Kart hiçbir şeyi onaylamaz; Vibento onayı sitede kalır.
// Sunucunun teslim ettiği mesajla eşleşmeyen etiket "doğrulanmamış" çizilir: bant, kırmızı ve düğme almaz.
// Seçim düğmesi yalnız gerçek tıklamayla, kişinin yazması gibi gider; yalnız seçim gider, soru metni gitmez; yalnız son yanıtta (kart-mantik dugmeIzni).
// =====================================================================

import { atom, memberOf, read, update } from 'claude-code'
import type { On } from 'claude-code'
import { KART_DEPO_ANAHTARI, ajanGoster, bantRengi, dugmeIzni, duzMetin, kartDugmeIzni, kartPlani, kaynakBul, metinBol, soruGirisi, temizGoster, toplamCevap } from './kart-mantik.mjs'

const ISTEK_ZEMINI = 'diffRemovedDimmed'
const BANT_YAZISI = '#10241c'

const ayrintiAcik = atom({ plugin: 'vibento', key: 'ayrintiAcik' } as const, false)
const verilenCevap = atom({ plugin: 'vibento', key: 'verilenCevap' } as const, '')
const secimler = atom({ plugin: 'vibento', key: 'secimler' } as const, {})
const kartPencere = atom({ plugin: 'vibento', key: 'kartPencere' } as const, null)
const sonSoru = atom({ plugin: 'vibento', key: 'sonSoru' } as const, '')
const mesajliTur = atom({ plugin: 'vibento', key: 'mesajliTur' } as const, false)
const sonKartlar = atom({ plugin: 'vibento', key: 'sonKartlar' } as const, [])

// Çift basış ve çizim arası: aynı kart ikinci kez göndermez.
const gonderilen = new Set<string>()

export const kartKaydet = (on: On) => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    try {
      // Özet satırının motor işareti kendi ağacımızda taşınmaz; özete dokunulmaz.
      if (e.props.isSummary) return next(e)
      const durum = await $.store.get(KART_DEPO_ANAHTARI) as { acik?: unknown; kaynaklar?: unknown } | undefined
      if (durum?.acik !== true) return next(e)
      const plan = kartPlani(e.props.text) as ReturnType<typeof kartPlani>
      if (!plan) return next(e)

      const { Box, Text, Button, Code, Markdown } = $.ui.resolve(e)
      const kapanis = plan.kapanis
      let kodSayaci = 0
      // Kod bloğu: motorun kopyalama düğmesi kartlı satırda yok, kutu ve düğme burada (ölçüm 5-7).
      // `wrap` açıkça verilir: varsayılanı panelde kırmadı (ölçüm 6). Dolgu iç kutuda: genişliği %100 kutuda satırı taşırıyor, kayma çıkıyor (ölçüm 7). En küçük genişlik sıfır ve taşan gizli: dar panelde de sağ kenar ve son kelime görünüyor (ölçüm 9).
      const kodKutusu = (kaynak: string, dil: string) => {
        kodSayaci += 1
        const anahtar = `kod${kodSayaci}`
        return (
          <Box key={`${anahtar}k`} flexDirection="column" width="100%" minWidth={0} overflow="hidden" borderStyle="single" borderColor="subtle">
            <Box flexDirection="column" minWidth={0} paddingLeft={1} paddingRight={1}>
            <Code source={kaynak} language={/^[\w+#.-]{1,30}$/.test(dil) ? dil : 'text'} wrap="wrap" />
            <Box flexDirection="row">
              <Button
                key={anahtar}
                variant="secondary"
                label="Kopyala"
                onPress={async (press) => {
                  try {
                    const sonuc = await $.ui.copy({ text: kaynak, surface: press.surface })
                    await $.ui.toast(sonuc.isCopied ? 'Panoya alındı.' : 'Panoya alınamadı, elle seç.')
                  } catch {
                    await $.ui.toast('Panoya alınamadı, elle seç.')
                  }
                }}
              />
            </Box>
            </Box>
          </Box>
        )
      }
      const uye = memberOf(ayrintiAcik, e)
      const cevapUye = memberOf(verilenCevap, e)
      const secimUye = memberOf(secimler, e)
      const kartParcalari = plan.parcalar.flatMap((p, i) => (p.tur === 'kart' ? [{ p, i }] : []))
      const sonK = kartParcalari.length > 0 ? await read($, sonKartlar) : []
      const dugmeliKartlar = kartParcalari.filter(({ p }) => kartDugmeIzni(p, kaynakBul(durum.kaynaklar, p.pencere, p.kimlik, p.ajan), sonK))
      const secimVar = kapanis !== null || dugmeliKartlar.length > 0
      const acik = kapanis ? (await read($, uye)) === true : false
      const verilen = secimVar ? await read($, cevapUye) : ''
      const secili = secimVar ? await read($, secimUye) : {}
      const ben = kapanis ? await read($, kartPencere) : null
      const kaynak = kapanis?.kaynak ?? null
      const kaynakBilgi = kaynak ? kaynakBul(durum.kaynaklar, kaynak.pencere, kaynak.kimlik, kaynak.ajan) : null
      const dugme = kapanis?.sorular
        ? dugmeIzni(kapanis, kaynakBilgi, await read($, sonSoru), await read($, mesajliTur))
        : false
      const dogrulanmamis = kaynak !== null && kaynakBilgi?.dogrulandi !== true
      const kapanisSorulari = dugme && kapanis?.sorular ? kapanis.sorular : []
      const kartAnahtar = (i: number) => `k${i}`
      const seciliSoru = kapanisSorulari.map((_, si) => secili[String(si)] ?? [])
      const seciliKart = dugmeliKartlar.flatMap(({ p, i }) => {
        const secim = secili[kartAnahtar(i)] ?? []
        return secim.length > 0 ? [{ kimlik: p.kimlik ?? '', secim }] : []
      })
      const kapanisTam = kapanisSorulari.length > 0 && seciliSoru.every((s) => s.length > 0)
      const kapanisBos = seciliSoru.every((s) => s.length === 0)
      const toplamSoru = dugmeliKartlar.length + kapanisSorulari.length
      // Tek soru tek seçimse basınca gider; gerisi işaretlenir, tek Gönder. Kartlardan yalnız bazısına cevap verilebilir, kapanış sorusu yarım gitmez.
      const hemenGider = toplamSoru === 1 && !(dugmeliKartlar[0]?.p.sorular?.[0]?.coklu ?? kapanisSorulari[0]?.coklu ?? false)
      const gonderHazir = !hemenGider && (kapanisTam || (seciliKart.length > 0 && kapanisBos))

      const gonder = async (metin: string) => {
        if (gonderilen.has(e.requestId)) return
        gonderilen.add(e.requestId)
        try {
          await update($, cevapUye, () => metin)
          await $.prompt.submit({ text: metin, asUser: true })
        } catch {
          gonderilen.delete(e.requestId)
          await update($, cevapUye, () => '')
          await $.ui.toast('Cevap gönderilemedi, yazarak ver.')
        }
      }

      const secenekDugmeleri = (anahtar: string, onEk: string, s: { secenekler: string[], coklu: boolean }, hemen: (etiket: string) => string) => s.secenekler.map((etiket, oi) => {
        const sec = secili[anahtar] ?? []
        const isaretli = sec.includes(etiket)
        return (
          <Button
            key={`${onEk}o${oi}`}
            variant={isaretli || oi === 0 ? 'primary' : 'secondary'}
            label={isaretli ? `✓ ${etiket}` : etiket}
            onPress={() => {
              if (hemenGider) return gonder(hemen(etiket))
              return update($, secimUye, (eski) => {
                const mevcut = eski[anahtar] ?? []
                const yeni = s.coklu
                  ? (mevcut.includes(etiket) ? mevcut.filter((x) => x !== etiket) : [...mevcut, etiket])
                  : [etiket]
                return { ...eski, [anahtar]: yeni }
              })
            }}
          />
        )
      })
      const gonderDugmesi = gonderHazir && !verilen
        ? <Button key="gonder" variant="primary" label="Gönder" onPress={() => gonder(toplamCevap(seciliKart, kapanisTam ? seciliSoru : null, kaynak?.kimlik ?? null))} />
        : null

      const bant = (ad: string, ajan: string | null, ek: string, ham: string | null, dogru: boolean) => {
        const renk = bantRengi(ham)
        return (
        <Box flexDirection="row" backgroundColor={renk ?? undefined} paddingLeft={1} paddingRight={1}>
          {renk ? null : <Text dimColor>● </Text>}
          <Text bold={dogru} dimColor={!dogru} color={renk ? BANT_YAZISI : undefined}>{ad}</Text>
          <Text dimColor={!renk} color={renk ? BANT_YAZISI : undefined}>{ajan ? ` · ${ajan}` : ''}{ek ? ` · ${ek}` : ''}</Text>
        </Box>
        )
      }

      return (
        <Box flexDirection="column" gap={1} width="100%">
          {plan.parcalar.map((p, i) => {
            if (p.tur === 'metin') {
              return metinBol(p.metin).map((b, j) => (b.tur === 'kod' ? kodKutusu(b.kaynak, b.dil) : <Markdown key={`m${i}y${j}`} text={b.metin} />))
            }
            const k = kaynakBul(durum.kaynaklar, p.pencere, p.kimlik, p.ajan)
            const istek = p.etiket !== 'BİLGİ' && k.dogrulandi
            const ajan = ajanGoster(p.pencere, p.ajan)
            const ek = k.dogrulandi ? p.etiket : `${p.etiket} · doğrulanmamış`
            const kartSoru = !verilen && dugmeliKartlar.some((d) => d.i === i) ? p.sorular?.[0] : undefined
            return (
              <Box
                key={`k${i}`}
                flexDirection="column"
                width="100%"
                borderStyle="single"
                borderColor={istek ? 'error' : (k.dogrulandi && k.renk ? bantRengi(k.renk) : 'subtle')}
                backgroundColor={istek ? ISTEK_ZEMINI : undefined}
              >
                {bant(p.pencere, ajan, ek, k.dogrulandi ? k.renk : null, k.dogrulandi)}
                <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
                  {kartSoru
                    ? (
                      <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
                        {kartSoru.metin ? <Text>{duzMetin(temizGoster(kartSoru.metin))}</Text> : null}
                        {secenekDugmeleri(kartAnahtar(i), `k${i}`, kartSoru, (etiket) => toplamCevap([{ kimlik: p.kimlik ?? '', secim: [etiket] }], null))}
                      </Box>
                    )
                    : <Markdown text={temizGoster(p.metin)} />}
                </Box>
              </Box>
            )
          })}
          {kapanis
            ? (
              <Box
                flexDirection="column"
                width="100%"
                borderStyle="single"
                borderColor={dogrulanmamis ? 'subtle' : 'error'}
                backgroundColor={dogrulanmamis ? undefined : ISTEK_ZEMINI}
              >
                {kaynak
                  ? bant(kaynak.pencere, ajanGoster(kaynak.pencere, kaynak.ajan), dogrulanmamis ? 'doğrulanmamış' : '', kaynakBilgi?.renk ?? null, !dogrulanmamis)
                  : ben
                    ? bant(ben.ad, ben.ajan, 'bu pencere', ben.renk, true)
                    : null}
                <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
                  <Text color={dogrulanmamis ? undefined : 'error'} dimColor={dogrulanmamis} bold size="heading">Senden istediğim</Text>
                  {dugme && !verilen && kapanis.sorular
                    ? (soruGirisi(kapanis.soru, kapanis.sorular) ? <Text>{duzMetin(temizGoster(soruGirisi(kapanis.soru, kapanis.sorular)))}</Text> : null)
                    : <Markdown text={temizGoster(kapanis.soru)} />}
                  {dugme && !verilen && kapanis.sorular
                    ? kapanis.sorular.map((s, si) => (
                      <Box key={`s${si}`} flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
                        {s.metin || (kapanis.sorular?.length ?? 0) > 1
                          ? <Text>{(kapanis.sorular?.length ?? 0) > 1 ? `${si + 1}. ` : ''}{duzMetin(temizGoster(s.metin))}</Text>
                          : null}
                        {secenekDugmeleri(String(si), `s${si}`, s, (etiket) => toplamCevap([], [[etiket]]))}
                      </Box>
                    ))
                    : null}
                  {kapanis.gorunur ? <Markdown dimColor text={temizGoster(kapanis.gorunur)} /> : null}
                  {kaynak?.etiket === 'ONAY İSTİYOR' && !dogrulanmamis ? <Text dimColor>Bu onay sitede verilir.</Text> : null}
                  <Box flexDirection="row" gap={1}>
                    {gonderDugmesi}
                    {verilen ? <Text dimColor>Cevabın: {verilen}</Text> : null}
                    <Button key="ayrinti" variant="secondary" label={acik ? 'Ayrıntıyı kapat' : 'Ayrıntı'} onPress={() => update($, uye, (v) => !v)} />
                  </Box>
                  {acik ? <Markdown dimColor text={temizGoster(kapanis.ayrinti)} /> : null}
                </Box>
              </Box>
            )
            : (dugmeliKartlar.length > 0
              ? (
                <Box flexDirection="row" gap={1}>
                  {gonderDugmesi}
                  {verilen ? <Text dimColor>Cevabın: {verilen}</Text> : null}
                </Box>
              )
              : null)}
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
