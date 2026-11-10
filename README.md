# Agent Havuzu Sağlık Panosu

Azure DevOps Server 2022 için extension. Pipelines menüsüne "Agent Sağlığı" sayfasını ekler ve tüm
self-hosted agent havuzlarını tek ekranda gösterir:

- Havuz başına online/offline agent sayısı, çalışan ve bekleyen iş, ortalama kuyruk bekleme süresi
- Sorunlu havuzlar üstte: offline agent, 5 dakikadan uzun bekleyen iş, çalışabilir agent kalmaması
- Agent başına durum, ne zamandır offline olduğu, sürüm, kısaltılmış işletim sistemi, çalışan iş
  ve son iş; havuzdaki farklı agent sürümleri uyarısı
- Tüm agent'ları devre dışı bırakılmış havuzlar kritik değil "devre dışı" görünür ve en altta
  listelenir (kuyruğunda güncel iş varsa yine kritik sayılır)
- Bir günden uzun bekleyen "bayat" işler bekleyen iş sayısına dahildir ama sağlık kurallarını
  etkilemez; kaç tanesinin bayat olduğu ayrıca yazılır ve kapalı bir listede gösterilir
- Son 90 gündür iş almamış agent'lar sayfanın altında "Kullanılmayan agent'lar" kartında listelenir
- Bekleyen her işin altında neden başlamadığı yazar: isteklerini (demands) karşılayan agent yok,
  uygun agent'lar meşgul ya da uygun agent'lar offline/devre dışı
- Bir saatten uzun çalışan iş "Uzun sürüyor" diye işaretlenir ve havuzu uyarıya çeker
- İş adları pipeline çalıştırmasına bağlantıdır (sunucu bağlantı döndürüyorsa)
- Havuz ya da agent adına göre arama; "Yalnızca sorunlular" ve "Devre dışıları gizle" filtreleri
- Bekleyen işler pipeline'a göre gruplanır ("Gece-Testi × 30"); grup açılınca işler tek tek görünür
- Havuz kartında kullanım kırılımı: tamamlanan son işlerde havuzu en çok meşgul eden 5 pipeline
- Deployment group havuzları da "Deployment" etiketiyle listelenir. Sayfanın üstündeki
  seçiciyle "Tümü", "Agent havuzları" ya da "Deployment havuzları" gösterilir; seçim özet kutularını da daraltır
- Havuz başına doluluk oranı: online agent'ların yüzde kaçı meşgul
- Agent satırında "Yetenekler" açılır listesi; içinde arama yapılabilir
- "CSV indir": gösterilen havuzların agent envanterini indirir (Türkçe arayüzde ayraç `;`,
  İngilizce'de `,`)
- Yetenek farkları: havuzdaki agent'ların yetenekleri yan yana karşılaştırılır; bir agent'ta
  eksik olan yetenek "yok" diye işaretlenir. Makine adı, PATH gibi doğal olarak farklı olanlar atlanır
- "Yalnızca benim işlerim" filtresi ve bekleyen işlerde "başlatan: …" bilgisi (yalnızca build
  işleri; release işlerinde başlatan okunmaz)
- Havuzdaki en yeni agent sürümünün gerisindeki agent'lar "Eski sürüm" olarak işaretlenir
- Uzun kuyruklarda ilk 10 grup gösterilir; "Tümünü göster" ile liste kendi içinde kayar
- 30 saniyede bir otomatik yenileme (kapatılabilir)

## Geliştirme

```bash
npm install
```

```bash
npm run dev
```

`http://localhost:3000/hub/hub.html` adresinde sayfa örnek veriyle açılır (`src/hub/mock.ts`).
Azure DevOps dışında açıldığında SDK kullanılmaz; gerçek veri yalnızca sunucuya yüklenince gelir.

```bash
npm test
```

## Dil

Arayüz Türkçe ve İngilizce'dir. Dil, kullanıcının Azure DevOps profilindeki dile göre seçilir
(`SDK.getPageContext().globalization.culture`): `tr` ile başlıyorsa Türkçe, diğer tüm dillerde
İngilizce. Azure DevOps Server 2022 bu bilgiyi extension'a göndermez (`getPageContext()` hata
fırlatır); o durumda sırayla Azure DevOps sayfasının diline, sonra tarayıcı diline bakılır.
Metinler `src/hub/i18n.ts` içindedir; yeni bir metin eklerken iki sözlüğe de ekleyin
(test, anahtarların eşleştiğini kontrol eder). Geliştirme modunda dil `?lang=tr` veya `?lang=en`
ile seçilir.

## Paketleme ve yükleme

```bash
npm run package
```

`out/` altında `.vsix` dosyası oluşur. Sunucuda: Collection Settings → Extensions → Browse local
extensions → Manage extensions → Upload extension, ardından collection'a Install.

Yeni sürüm yüklerken `vss-extension.json` içindeki `version` değerini artırın.

## Marketplace'e yayınlama

Extension `turanemin` publisher'ı altında yayınlanacak şekilde ayarlıdır. Marketplace sayfasının
içeriği `overview.md` dosyasından gelir.

1. `turanemin` publisher'ının https://marketplace.visualstudio.com/manage adresinde tanımlı
   olduğunu kontrol edin.
2. Ya `out/` altındaki `.vsix` dosyasını bu sayfadan "New extension → Azure DevOps" ile yükleyin,
   ya da komut satırından yayınlayın (Marketplace → Manage yetkili bir PAT sorar):

```bash
npm run publish:marketplace
```

Manifest'te `"public": true` olduğu için extension herkese açık yayınlanır ve Marketplace'te
herkes tarafından görülüp kurulabilir. Bu, publisher'ın Marketplace'te doğrulanmış olmasını
gerektirir. Özel yayın için değeri `false` yapın.

## Yapı

| Dosya | İçerik |
| --- | --- |
| `vss-extension.json` | Manifest: hub katkı noktası, `vso.agentpools` ve `vso.build` scope'ları |
| `src/hub/hub.tsx` | Arayüz ve SDK başlatma |
| `src/hub/api.ts` | REST çağrıları (`api-version=7.0`) |
| `src/hub/metrics.ts` | Sağlık kuralları ve hesaplamalar (saf fonksiyonlar, testli) |
| `src/hub/i18n.ts` | Türkçe ve İngilizce metinler, dil seçimi |
| `src/hub/export.ts` | CSV dışa aktarma |
| `src/hub/mock.ts` | Geliştirme için örnek veri |

Eşikler `metrics.ts` içindeki sabitlerdir: `QUEUE_WARN_SEC` (kuyruk uyarısı, 5 dk), `STALE_SEC`
(bayat iş, 1 gün), `STUCK_SEC` (uzun süren iş, 1 saat), `UNUSED_SEC` (kullanılmayan agent, 90 gün). Yenileme aralığı `REFRESH_MS` ve
listede gösterilen iş sayısı `QUEUE_PREVIEW`, `hub.tsx` içindedir.

## Sunucuda doğrulanması gerekenler

Bu sürüm yalnızca örnek veriyle ve birim testleriyle denendi; gerçek bir Azure DevOps Server
üzerinde henüz çalıştırılmadı. İlk yüklemede şunları kontrol edin:

1. **İş kuyruğu uç noktası.** Bekleyen işler `_apis/distributedtask/pools/{id}/jobrequests`
   adresinden `api-version=7.0-preview.1` ile okunur. Bu uç nokta resmi olarak belgelenmemiştir.
   Hata dönerse sayfa çalışmaya devam eder ama o havuzda "İş kuyruğu okunamadı" notu görünür.
2. **Yetki.** Sayfa, kullanıcının görme yetkisi olan havuzları gösterir. Havuzda Reader rolü
   olmayan kullanıcılar boş liste veya havuz bazında HTTP 403 uyarısı görür.
3. **Collection adresi.** Adres SDK'nın Location servisinden alınır. Sanal dizinli kurulumlarda
   (`/tfs/...`) "Havuz ayarlarını aç" bağlantısının doğru sayfaya gittiğini kontrol edin.
4. **Dil.** Profil dili Türkçe ve İngilizce iken sayfanın doğru dilde açıldığını kontrol edin.
   Server 2022'de profil dili okunamıyor; sayfa tarayıcı dilini izliyor olabilir.
5. **Offline süresi.** Agent'ın `statusChangedOn` alanından okunur. Sunucu bu alanı döndürmezse
   süre gösterilmez; "Kullanılmayan agent'lar" listesinde hiç iş almamış agent'lar için de
   `createdOn` alanı gerekir.
6. **Bekleme nedeni.** İşin `demands` alanı ile agent'ların yetenekleri
   (`includeCapabilities=true`) karşılaştırılır; sunucu `matchedAgents` döndürürse o kullanılır.
   Bu alanlar gelmezse neden yalnızca havuzdaki agent'ların durumuna göre yazılır. Bilinen bir
   pipeline için yazılan nedenin doğru olduğunu kontrol edin.
7. **Bağlantılar.** İş adına tıklayınca doğru pipeline çalıştırmasının yeni sekmede açıldığını
   kontrol edin. Sunucu bağlantı döndürmezse ad düz metin olarak kalır.
8. **Deployment havuzları.** Deployment havuzlarının listelendiğini, agent'larının okunduğunu ve
   "Havuz ayarlarını aç" bağlantısının (`_settings/deploymentpools?poolId=…`) doğru sayfaya
   gittiğini kontrol edin; bu adres doğrulanmadı.
9. **İşi başlatan kişi.** İş kaydındaki `planType`, `scopeId` ve `owner.id` alanlarıyla
   `{proje}/_apis/build/builds?buildIds=…` sorgulanır (`vso.build`). Bu alanlar gelmezse ya da
   sorgu reddedilirse "Yalnızca benim işlerim" düğmesi hiç görünmez. Yeni scope nedeniyle
   güncellemeden sonra extension'ın collection yöneticisi tarafından yeniden onaylanması gerekir.
10. **CSV indirme.** Sayfa Azure DevOps içinde bir çerçevede çalışır; tarayıcının bu çerçeveden
   dosya indirmeye izin verdiğini kontrol edin.
11. **Tema.** Koyu temada renklerin okunur olduğunu kontrol edin.

## Lisans ve sürüm notları

MIT lisansı (`LICENSE`). Sürüm notları `CHANGELOG.md` dosyasındadır; yeni sürümde hem bu dosyayı
hem `overview.md` içindeki "Release notes" bölümünü güncelleyin. Kaynak adresi manifest'te
`https://github.com/eminturan/agent-pool-health` olarak tanımlıdır.

## Menü adı

Pipelines menüsündeki ad (`Agent Health`) manifest'ten gelir ve her dilde aynıdır. `tfx-cli`'nin
dil paketi desteği (`--loc-root`) bu sürümde devre dışı olduğu için ad dile göre değiştirilemiyor.

## Kapsam dışı

- Disk, CPU, bellek gibi makine metrikleri (Azure DevOps bu veriyi tutmaz)
- Geçmişe dönük trend (veri saklama gerektirir)
- Dashboard widget'ı
