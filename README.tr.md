# Agent Havuzu Sağlık Panosu

[English](README.md) | **Türkçe**

Pipelines menüsüne **Agent Health** sayfasını ekleyen ve tüm self-hosted agent havuzlarının ve
deployment havuzlarının durumunu tek sayfada gösteren bir Azure DevOps extension'ı. Yalnızca veri
okur.

Azure DevOps Server 2022 ve Azure DevOps Services üzerinde çalışır.

## Özellikler

**Genel görünüm**

- Özet kutuları: sorunlu havuz, offline agent, çalışan iş, bekleyen iş
- Havuz başına bir kart: online agent, doluluk oranı, çalışan ve bekleyen iş, ortalama kuyruk
  bekleme süresi
- Sorunlu havuzlar üstte listelenir; sayfa 30 saniyede bir yenilenir (kapatılabilir)
- "Tümü", "Agent havuzları" ve "Deployment havuzları" arasında geçiş; özet kutuları seçime uyar

**Sağlık kuralları**

- Uyarı: offline agent, 5 dakikadan uzun bekleyen iş, 1 saatten uzun çalışan iş ya da okunamayan
  agent listesi
- Kritik: havuzda agent var ama hiçbiri iş çalıştıramıyor
- Devre dışı: havuzdaki tüm agent'lar devre dışı ve kuyrukta güncel iş yok. Gri görünür, en altta
  listelenir, sorun sayılmaz
- Bir günden uzun bekleyen işler "bayat"tır: kuyrukta sayılır ve ayrı listelenir ama uyarı
  üretmez

**Kuyruk**

- Bekleyen işler pipeline'a göre gruplanır ("Gece-Testi × 30"); grup açılınca işler tek tek
  görünür
- Bekleyen her işin altında neden beklediği yazar: isteklerini (demands) karşılayan agent yok
  (ve hangi istek karşılanmıyor), uygun agent'lar meşgul ya da uygun agent'lar offline/devre dışı
- İş adları pipeline çalıştırmasına bağlantıdır

**Agent'lar**

- Durum, ne zamandır offline olduğu, sürüm, işletim sistemi, çalışan iş, son iş
- Havuzdaki en yeni agent sürümünün gerisindeki agent'lar "Eski sürüm" olarak işaretlenir
- Yetenekler: agent satırı açılınca yetenek listesi görünür ve içinde arama yapılabilir
- Yetenek farkları: havuzdaki agent'lar yan yana karşılaştırılır; hangi yeteneğin hangi agent'ta
  eksik olduğu görünür. Bilgisayar adı, PATH gibi makineye özgü değerler atlanır
- Kullanılmayan agent'lar: tüm havuzlarda son 90 gündür iş almamış agent'lar

**Diğer**

- Kullanım: tamamlanan son işlerde havuzu en çok meşgul eden beş pipeline
- Havuz ya da agent adına göre arama; "Yalnızca sorunlular" ve "Devre dışıları gizle" filtreleri
- Agent envanterini CSV olarak indirme
- Türkçe ve İngilizce arayüz

## Kurulum

Paketi üretin (aşağıya bakın) ya da Marketplace'ten indirin, ardından sunucuda: Collection
Settings → Extensions → Browse local extensions → Manage extensions → Upload extension ile
yükleyip collection'a kurun. Sayfa her projede **Pipelines → Agent Health** altında görünür.

## Yetkiler

| Scope | Ne için |
| --- | --- |
| `vso.agentpools` | Agent havuzlarını, agent'ları ve iş kuyruklarını okuma |

Sayfa, oturum açan kullanıcının görme yetkisi olan havuzları gösterir. Havuzda Reader rolü
olmayan kullanıcı, agent'lar yerine o havuz için bir uyarı görür.

## Güvenlik

- **Yalnızca okur.** Extension, `vso.agentpools` yetkisiyle yalnızca GET isteği yapar. Agent,
  havuz ya da iş üzerinde değişiklik yapamaz.
- **Kullanıcının kendi yetkileri geçerlidir.** Her istek oturum açan kullanıcı adına yapılır;
  neyi görebileceğine sunucu karar verir. Erişim anahtarı yalnızca collection adresine gönderilir,
  saklanmaz ve loglanmaz.
- **Havuzda okuma yetkisi olan ne görür.** Kuyruk, havuzu kullanan tüm projelerin pipeline'larını
  listeler; kullanıcı, açamadığı bir projedeki pipeline'ın adını görebilir. Bunu havuzdaki Reader
  rolü belirler (Collection Settings → Agent pools → Security); Azure DevOps'un kendi havuz
  sayfalarında da durum aynıdır.
- **Yeteneklerdeki gizli değerler maskelenir.** Agent'lar makinelerindeki ortam değişkenlerini
  yetenek olarak bildirir. Adı gizli bir değeri çağrıştıran yeteneklerin (token, password, secret,
  key, credential, connection string, auth, cert, PAT) değeri ve adreslere gömülü kimlik bilgileri
  sayfanın her yerinde `••••••` olarak gösterilir. Ada göre maskeleme, masum bir adla saklanan
  gizli değeri yakalayamaz; agent ortam değişkenlerinde gizli değer tutmayın.
- **CSV dosyası Excel'de güvenle açılır.** `=`, `+`, `-` ya da `@` ile başlayan hücrelerin başına
  tek tırnak eklenir; böylece bir pipeline ya da agent adı formül olarak çalışamaz.
- **Bağlantılar.** Yalnızca `http` ve `https` adresleri bağlantı olarak gösterilir.
- **Sunucu yükü.** Tarayıcı sekmesi arka plandayken sayfa yenilemeyi durdurur.

## Geliştirme

```bash
npm install
```

```bash
npm run dev
```

Sayfa `http://localhost:3000/hub/hub.html` adresinde `src/hub/mock.ts` içindeki örnek veriyle
açılır. Azure DevOps dışında SDK kullanılmaz; gerçek veri yalnızca extension kurulduğunda gelir.
Dili seçmek için adrese `?lang=tr` ya da `?lang=en` ekleyin.

```bash
npm test
```

### Yapı

| Dosya | İçerik |
| --- | --- |
| `vss-extension.json` | Manifest: hub katkı noktası, scope'lar |
| `src/hub/hub.tsx` | Arayüz ve SDK başlatma |
| `src/hub/api.ts` | REST çağrıları (`api-version=7.0`) |
| `src/hub/metrics.ts` | Sağlık kuralları ve hesaplamalar (saf fonksiyonlar, testli) |
| `src/hub/i18n.ts` | Türkçe ve İngilizce metinler, dil seçimi |
| `src/hub/export.ts` | CSV dışa aktarma |
| `src/hub/mock.ts` | Geliştirme için örnek veri |

Eşikler `metrics.ts` içindeki sabitlerdir: `QUEUE_WARN_SEC` (kuyruk uyarısı, 5 dk), `STUCK_SEC`
(uzun süren iş, 1 sa), `STALE_SEC` (bayat iş, 1 gün), `UNUSED_SEC` (kullanılmayan agent, 90 gün).
Yenileme aralığı `REFRESH_MS` ve kuyrukta gösterilen satır sayısı `QUEUE_PREVIEW`, `hub.tsx`
içindedir.

### Dil

Dil, kullanıcının Azure DevOps profilindeki dile göre seçilir
(`SDK.getPageContext().globalization.culture`): `tr` ile başlıyorsa Türkçe, diğer tüm dillerde
İngilizce. Azure DevOps Server 2022 bu bilgiyi extension'a göndermez (`getPageContext()` hata
fırlatır); o durumda sırayla Azure DevOps sayfasının diline, sonra tarayıcı diline bakılır.

Tüm metinler `src/hub/i18n.ts` içindedir. Yeni bir metni iki sözlüğe de ekleyin; bir test
anahtarların eşleştiğini kontrol eder.

Pipelines menüsündeki ad (`Agent Health`) manifest'ten gelir ve her dilde aynıdır.

## Paketleme ve yayınlama

```bash
npm run package
```

`out/` altında bir `.vsix` dosyası oluşur. Yeni bir paket yüklemeden önce `vss-extension.json`
içindeki `version` değerini artırın; sunucu daha önce gördüğü sürümü kabul etmez.

Extension `turanemin` publisher'ı altında yayınlanacak şekilde ayarlıdır; Marketplace sayfası
`overview.md` dosyasıdır. `.vsix` dosyasını https://marketplace.visualstudio.com/manage adresinden
yükleyin ya da komut satırından yayınlayın (Marketplace → Manage yetkili bir PAT sorar):

```bash
npm run publish:marketplace
```

Manifest'teki `"public": true`, extension'ı herkese açık yayınlar; özel yayın için `false` yapın.
Yeni sürümde hem `CHANGELOG.md` dosyasını hem `overview.md` içindeki "Release notes" bölümünü
güncelleyin.

## Denendiği ortam

Azure DevOps Server 2022.0.1: sayfa açılıyor, agent havuzları ve agent'lar listeleniyor, iş
kuyruğu okunuyor.

Aşağıdakiler sunucunun döndürüp döndürmeyeceği belli olmayan alanlara bağlıdır ve yalnızca örnek
veriyle denenmiştir. Verisi gelmeyen özellik sayfayı bozmaz:

| Özellik | Bağlı olduğu veri | Gelmezse |
| --- | --- | --- |
| Bekleyen işler | `pools/{id}/jobrequests` (`7.0-preview.1`, belgelenmemiş) | O havuzda "İş kuyruğu okunamadı" notu |
| Offline süresi | Agent'taki `statusChangedOn` | Süre gösterilmez |
| Hiç iş almamış agent'lar | Agent'taki `createdOn` | Agent kullanılmayanlar listesine girmez |
| İşin neden beklediği | İşteki `demands` / `matchedAgents`, agent'taki yetenekler | Neden yalnızca agent durumuna göre yazılır |
| Çalıştırma bağlantıları | İşteki `owner._links.web.href` | İş adı düz metin kalır |
| Deployment havuzları | `pools?poolType=deployment` | Yalnızca agent havuzları görünür |
| CSV indirme | Tarayıcının extension çerçevesinden indirmeye izin vermesi | Dosya inmez |

Azure DevOps Server 2022.0.1'de bu tablodaki alanların hepsi geldi; bunu sayfanın en altındaki
Diagnostics bölümü gösterdi. Bir şey yanlış göründüğünde orayı açın: sunucudan ne okunabildiğini
listeler (yalnızca sayılar, alan adları ve sunucunun hata mesajları).

## Kapsam dışı

- Disk, CPU, bellek gibi makine metrikleri (Azure DevOps bu veriyi tutmaz)
- Geçmişe dönük trend (veri saklama gerektirir)
- Bildirim (extension yalnızca sayfa açıkken çalışır)
- "Benim işlerim" gibi geliştiriciye özel görünüm: bu sayfa agent sağlığıyla ilgilidir; işi kimin
  başlattığını bulmak build okuma yetkisi gerektirir ve ayrı bir extension'ın konusudur

## Lisans

[MIT](LICENSE) © Emin Turan. Sürüm notları [CHANGELOG.md](CHANGELOG.md) dosyasındadır.
