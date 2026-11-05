// ÜRETİLDİ: scripts/eklenti-esitle.mjs (kaynak src/server/mcp/araclar.mjs). Elle düzenleme.
// PreToolUse kimlik kanıtının ezdiği araçlar: giriş şemasında `kaynak_oturum` olanlar.
export const KIMLIK_ARACLARI = ["is_sec","is_kaldigimiz_yer_yaz","is_gorev_guncelle","not_birak","not_okundu","is_dal_ac","is_geri_don","pencere_listele","pencereye_yaz","pencere_ac","alt_is_ac","koordinator_sec","is_bolumu_tanit","onay_iste","onay_geri_cek"];
// Vibento araçlarının tamamı ve salt okuyanları (`notlar.readOnlyHint`): izin kararı bu listeden, önek benzerliğinden değil.
export const TUM_ARACLAR = ["is_listele","is_sec","is_kaldigimiz_yer_oku","is_kaldigimiz_yer_yaz","is_gorev_guncelle","not_birak","gunluk_ara","not_okundu","is_dal_ac","is_geri_don","katilimci_durum_yaz","pencere_listele","pencereye_yaz","pencere_ac","alt_is_ac","koordinator_sec","is_bolumu_tanit","onay_iste","onay_geri_cek"];
export const OKUMA_ARACLARI = ["is_listele","is_kaldigimiz_yer_oku","gunluk_ara","pencere_listele"];
