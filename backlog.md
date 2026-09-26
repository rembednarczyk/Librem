# Backlog & State — Cogitator Omnissiah

> **Trwała pamięć projektu.** Ten plik jest źródłem prawdy o stanie prac, ustaleniach
> i findingsach — tak, żeby okno kontekstowe można było w dowolnym momencie `/clear`-ować
> bez utraty wiedzy. Zasady prowadzenia tego pliku: patrz `CLAUDE.md` → „Workflow rules".

## Jak używać

- **Na starcie sesji**: przeczytaj ten plik zanim zaczniesz pracę.
- **Po każdej zmianie / ustaleniu**: dopisz finding, decyzję lub odhacz pozycję —
  zanim zrobisz `/clear`. Plik ma odzwierciedlać stan HEAD, nie historię czatu.
- **Format**: findings i decyzje idą do sekcji poniżej; wpisy wersji do „Changelog".
- Trzymaj zwięźle: jedna linia = jeden fakt. Rozwlekłe analizy zostają w `docs/`.

## Stan bieżący

- Wersja aplikacji: **1.84.0** (źródło prawdy: `metadata.json`; mirror w `package.json` + `package-lock.json`).
- **Nazwa projektu: „Librem"** (rebranding z „Cogitator Omnissiah", 1.81.0–1.81.1). Plik wytycznych to
  `LIBREM_GUIDELINES.md`. ZERO wystąpień starej nazwy w repo.
- **`render.yaml` NIE jest podpięty jako Blueprint** (zweryfikowane przez użytkownika w dashboardzie —
  sekcja Blueprints pusta; serwis powstał ręcznie). Render tego pliku NIE czyta → trzymamy go jako
  dokumentację konfiguracji. Dlatego zmiana `name` na `librem` (1.81.1) była bezpieczna. GDYBY kiedyś
  podpinać go jako Blueprint: dopasowanie idzie WYŁĄCZNIE po `name`, więc musi zgadzać się z nazwą
  istniejącego serwisu, inaczej Render tworzy DRUGI serwis (nic nie kasuje, ale zostają dwa).
- **Subdomena Rendera jest niezmienialna** — przypisywana przy TWORZENIU serwisu, zmiana nazwy jej nie
  rusza (otwarty feature request u Rendera). Dlatego nowy adres wymagał nowego serwisu.
- **Repo: `rembednarczyk/Librem`** (przemianowane 2026-09-18, literówka „mm" zniknęła). Remote lokalny
  zaktualizowany.
- **Produkcja: `https://librem.onrender.com`** — użytkownik postawił NOWY serwis 1:1 (stary URL
  `cogitator-omnissiah.onrender.com` był nieusuwalny, subdomeny Rendera nie da się zmienić). Blueprint
  nadal NIE podpięty.
- **`OMNISSIAH_VAULT.md`** — pamiątka po dawnej nazwie + słownik dekodujący nazewnictwo 40k. Nic go nie
  czyta; służy do czytania starej historii gita.
- Branch roboczy: `claude/book-aggregator-setup-t6kfvd`. Deploy leci z `main` — zmiany
  muszą trafić na `main` (PR + merge), inaczej redeploy serwuje stary kod.
- **Konwencja PR/issue**: jedna logiczna zmiana = jeden granularny PR (nie batchujemy).
  Każde zadanie śledzimy issue i domykamy przez `Fixes #N` w opisie PR (linkowanie +
  auto-close). Nie tworzymy sztucznych PR-ów/issue bez realnej wartości.
- Suite: 563 testów zielonych; `npm run lint` (tsc) czysty; `npm run build` OK.

## Findings & decyzje (aktualne)

- **Vinted DOM drift (rozwiązane, PR #52)** — Vinted przeszedł na Next.js z hashowanymi
  klasami CSS-modules (`Grid-module-scss-module__…__feed-grid__item`) i przestał emitować
  blob `data-component-name="Catalog"`. Parser dopasowuje kafelki po stabilnym suffiksie
  `feed-grid__item"`, wyciąga cenę strukturalną, walutę, czysty URL i miniaturę
  `images1.vinted.net`. Szczegóły: `docs/vinted-scanner.md`.
- **Vinted `parsed:0` bywa POPRAWNE** — wyszukiwarka Vinted jest rozmyta i zwraca
  sąsiednie tytuły. Potwierdzone jako słuszne 0: „Dzieci nocy" (Simmons; same „…nocy"),
  „Eden w ogniu" (Simmons). `parsed:0` nie oznacza automatycznie buga parsera —
  weryfikuj po `itemLinks` vs faktyczne tytuły.
- **Vinted „skaner sam się ubija" (#2) — ROZWIĄZANE (1.0.4).** Root cause POTWIERDZONY
  logami Rendera: NIE watchdog, tylko `JavaScript heap out of memory`. Heap rósł
  monotonicznie ~10 MB/książkę do ~268 MB (pełny GC nie zwalniał → żywa retencja).
  Przyczyna: V8 **SlicedString** — `str.match()`/`.split()` na 7 MB HTML zwraca podstring
  trzymający wskaźnik do CAŁEGO rodzica; pola oferty (title/url/price/photo) trafiały do
  `results` i pinowały 7 MB na każde trafienie. Fix: `detach()` (kopia bajtów przez
  Buffer) na polach z HTML w `parseVintedItems` ścieżki 3/4. KROK 1 (watchdog 120 s,
  1.0.2) był ślepy — skan padał WCZEŚNIEJ (26 vs 28), co wykluczyło watchdog.
- **NIE skracaj timeout/retry scrapera** — #48 to zrobił (30→15 s) i dał zero trafień
  (ucinał wolne, poprawne odpowiedzi Cloudflare). Cofnięte (#49). Timeout zostaje 30 s.
- **Bloki Vinted = przestarzała pula UA, NIE scoring IP (potwierdzone 2026-08-25).** Po
  fali wykryć bota samo odświeżenie puli UA (#173, Chrome 120–122→151/152 itd.) zdjęło
  bloki na produkcji — reszta konfiguracji była nietknięta (audyt: bajt w bajt). Wniosek
  operacyjny: gdy Vinted znów zacznie wykrywać, NAJPIERW odśwież pulę UA w
  `scrapingClient.ts` do bieżących wersji (cadence ~kwartał), zanim sięgniesz po
  throttle/proxy. Pilnuj realnych formatów (Chrome x.0.0.0, Safari Version/26.0,
  zamrożone tokeny platform).
- **Skan na Render free: ~160 poz./przebieg** — długi skan (~214 poz., 15–20 min) bywa
  ucinany, gdy klient się rozłączy (tło karty / blip) → serwer `res close` →
  `stopActiveSync()`, a potem kontener zwija się po idle. To infra (Render free), NIE
  kod — OOM naprawiony (1.0.4). Trwały fix: odpiąć skan od połączenia SSE (skan leci
  serwerowo, UI podgląda + wpina się ponownie) + płatny tier/kolejka. ODŁOŻONE — na
  free i tak brak pełnej gwarancji; na razie dokańczamy w kilku przebiegach.
- **Sprzedawca NIE jest w HTML katalogu Vinted** — kafelek oferty ma tylko
  url/tytuł/cena/foto; brak `user_id`/`/member/` w kafelku (zweryfikowane na view-source).
  Bundling „kilka książek u jednego sprzedawcy" wymaga dociągnięcia sprzedawcy z osobnego
  źródła (strona `/items/{id}` albo `/api/v2/items/{id}` / catalog API) — czyli backend.
- **Marker debug `grid` vs `html`** — `html` w logach skanera oznacza, że oferty złapał
  tylko fallback (ścieżka 4), a nie siatka. Po wdrożeniu fixu na stronach z siatką ma
  być `grid`. Jeśli po redeployu dalej `html` na stronie z siatką → deploy serwuje
  stary bundle / nie odpalił `npm run build`.

## Changelog

Wersja ze źródła prawdy `metadata.json` (mirror w `package.json`). Najnowsze na górze.

- **1.84.0** — **Konfigurowalny egress `WikiAdapter` + Cloudflare Worker (obejście blokady IP encyklopedii).**
  POTWIERDZONE logiem Render: encyklopedia zwraca 403 (`ip_blocked`, zwykła strona Apache — NIE challenge CF) dla
  IP datacenter Render; dotyczy podglądu cyklu ORAZ book sync (ta sama ścieżka). Fix na poziomie adaptera:
  `resolveWikiBaseUrl()` (export, czytany per-call) zwraca `WIKI_PROXY_URL` gdy ustawione, inaczej origin
  bezpośrednio (domyślnie, zero zmiany zachowania); opcjonalny `WIKI_PROXY_KEY` → nagłówek `X-Proxy-Key`. Nowy
  `cloudflare/wiki-proxy.js`: reverse-proxy api.php (GET-only, gate na współdzielony sekret by nie był otwartym
  proxy, descriptive bot-UA, edge-cache 5 min, przepuszcza status). 3 nowe testy egressu (default/override/realny
  routing). `.env.example` + instrukcja wdrożenia w nagłówku Workera. WYMAGA wdrożenia Workera + env-ów na Render
  (po stronie usera). 563 testy.
- **1.83.0** — **Szyna zdarzeń stanu „przeczytane" (`ReadStateContext`) — cross-widget awareness.**
  AUDYT: oznaczanie „przeczytane"/„posiadam" jest dostępne z 5 miejsc (Regał drag&drop, statystyki:
  OwnedUnread/Postęp bibliotek/Książki-w-bibliotekach, Cykle). Dane ZAWSZE spójne (backend inwaliduje
  `booksCache` na każdym zapisie — `mutateMultiSelect` + `setReadDate`), a między zakładkami spójność
  daje remount+`?t=` na fetchu. Realna luka była JEDNA: w zakładce Kolekcja `CyclesHarvestCard` ma własny
  hook (`useCyclesHarvest`), więc oznaczenie w Cyklach nie odświeżało statystyk (KPI/tempo/OwnedUnread)
  i odwrotnie. FIX (wybór usera: wariant systemowy, nie chirurgiczny): `src/contexts/ReadStateContext.tsx`
  — malutki pub/sub (ref-backed Set, nie state; null-safe poza providerem). Każdy UDANY zapis publikuje
  `notifyReadChange()`, każdy widżet czytający subskrybuje własny refetch (`useReadStateListener`).
  Podpięci PUBLISHERZY: `useMarkAsRead` (tylko nie-filialne znaczniki — filia zostaje optymistyczna przez
  read-after-write lag Notion), `useCyclesHarvest.toggleSource`, `useShelfMutations.applyReadChange`
  (jednorodność; Regał dziś bez współzamontowanego subskrybenta). SUBSKRYBENCI: `useStats.fetchStats`,
  `useCyclesHarvest.fetchHarvest(silent)`. `useBooks` (Regał) CELOWO nie subskrybuje (optymistyczny,
  nigdy nie współzamontowany — subskrypcja = refetch całego indeksu na każdy drag). Provider w `main.tsx`.
  5 nowych testów szyny (dispatch, ref-latest, unmount, throw-isolation, brak-providera). 560 testów.
  UWAGA: „wyciągnięcie przycisku do wspólnego komponentu" (pierwotny pomysł) NIE rozwiązałoby awareness
  (to problem niezależnych hooków danych, nie markupu) — nadal otwarte jako czysty DRY (5 kopii przycisku).
- **1.82.1** — **Pin wersji Node (`.node-version` = 20) + urealniona sekcja wdrożenia w README.**
  Render wybiera Node wg priorytetu `NODE_VERSION` → `.node-version` → `.nvmrc` → `engines`, a jego
  DOMYŚLNA wersja zależy od DATY UTWORZENIA serwisu i rośnie (dla serwisów tworzonych po 2026-09-17 to
  Node 24) — czyli nowy serwis `librem` mógł wstać na wersji łamiącej `engines` (`>=18 <21`). Pin usuwa
  tę zależność. README: usunięte twierdzenie, że repo wdraża się blueprintem (NIE jest podpięty), dodana
  tabela ustawień serwisu z uzasadnieniami — w tym `npm ci --include=dev`, bez którego build pada,
  bo `vite`/`esbuild`/`typescript` siedzą w `devDependencies`.
  **UWAGA/NIESPÓJNOŚĆ DO DECYZJI**: sandbox deweloperski działa na Node 22.22.2 (tam przechodzi cały
  suite), a `engines` deklaruje `<21`. Pin ustawiłem na 20, bo mieści się w ZADEKLAROWANYM kontrakcie —
  nie poszerzałem `engines` samodzielnie. Do rozstrzygnięcia: albo poszerzyć `engines` do `<23` i pinować
  22 (pinować to, na czym się testuje), albo zostawić 20.
- **1.82.0** — **Dług nazewniczy domknięty + `OMNISSIAH_VAULT.md`.** README opisywał UI sprzed v1.61.0:
  zakładki „Skryptorium"/„Liturgie" (dziś **Katalog**/**Synchronizacja**), zadania „Puryfikacja",
  „Sanctity", „Żniwa Cykli", „Sanktuarium Kalibracji". To była NIEAKTUALNA DOKUMENTACJA, nie kwestia
  klimatu — wszystkie nazwy zrównane z tym, co UI pokazuje naprawdę (źródło prawdy: tablica `rituals`
  w `OtherToolsCard.tsx` + `tabs` w `App.tsx`). „Rytuał" jako rzeczownik pospolity → „zadanie".
  `docs/skryptorium-search.md` → `docs/catalog-search.md` (+ 3 odwołania). Komentarze w kodzie
  podające złą nazwę zakładki poprawione. Przy okazji: DOPISANY brakujący wiersz tabeli **Nadawanie
  ISBN** (`/api/sync-isbn-enrich`, `/api/isbn/:code`) — feature istniał od 1.50.0, ale README go nie znało.
  Nowy `OMNISSIAH_VAULT.md`: pamiątka + SŁOWNIK DEKODUJĄCY stare nazwy (potrzebny do czytania historii
  gita i starych issues) + spis tego, co z 40k zostało świadomie.
  **NIE RUSZONE (świadomie)**: identyfikatory w kodzie — `LiturgySection.tsx`, `SanctityDebugger.tsx`,
  `RitualButton.tsx`, `ritualColors.ts`, typ `RitualColor`, tablica `rituals`, komentarze „Wielki Rytuał";
  teksty serwisów backendu (`Nieznany rytuał synchronizacji`); `docs/bookshelf.md` („noospheric Adeptus
  Mechanicus skin" — to NAZWA skórki motywu ciemnego, który celowo zachowuje wygląd 40k).
  **DECYZJA UŻYTKOWNIKA (2026-09-18): identyfikatory w kodzie ZOSTAJĄ JAKO PAMIĄTKA — nie przemianowujemy
  ich ani teraz, ani przy okazji innych zmian.** Zapisane w `CLAUDE.md` (sekcja Conventions) i w
  `OMNISSIAH_VAULT.md`, żeby nie wracało jako „dług do spłacenia". Temat rebrandingu ZAMKNIĘTY.
- **1.81.1** — **Domknięcie rebrandingu: `render.yaml` `name` → `librem`.** Użytkownik zweryfikował
  w dashboardzie Rendera, że sekcja Blueprints jest PUSTA — serwis powstał ręcznie, więc Render tego
  pliku nie czyta i zmiana jest bez skutków runtime'owych. Dopisany komentarz nagłówkowy: plik jest
  dokumentacją konfiguracji, a przy ewentualnym podpięciu Blueprintu `name` musi zgadzać się z nazwą
  istniejącego serwisu (dopasowanie idzie tylko po niej). Po tej zmianie w repo nie ma już ANI JEDNEGO
  wystąpienia starej nazwy.
- **1.81.0** — **Rebranding „Cogitator Omnissiah" → „Librem" (warstwa repo/dokumentacji).** UI był już
  Librem od 1.61.0; ta zmiana domyka TOŻSAMOŚĆ PROJEKTU. `COGITATOR_GUIDELINES.md` → `LIBREM_GUIDELINES.md`
  (`git mv`, historia zachowana) + wszystkie odwołania (README, CLAUDE.md, docs/README.md oraz komentarze
  w `src/hooks/useSyncManager.ts` i `src/theme/ritualColors.ts`); H1 wytycznych na „LIBREM: ARCHITECTURAL
  GUIDELINES (v1.7)"; `metadata.json` `name` → „Librem" (czytany TYLKO przez człowieka — `vite.config.ts`
  importuje stamtąd wyłącznie `version`); `package.json`/`package-lock.json` `name` z zaszłego
  `react-example` → `librem`; realm Basic Auth → `Librem`. README: nowy tytuł/lead + USUNIĘTY akapit
  o konwencji Warhammer 40k (sprzeczny z CLAUDE.md od 1.61.0) + poprawiona NIEAKTUALNA informacja
  „Endpointy nie są uwierzytelniane" (od 1.77.0 Basic Auth fail-closed).
  **NIE ZMIENIONE ŚWIADOMIE**: `render.yaml` `name: cogitator-omnissiah` (zmiana w blueprincie = Render
  tworzy NOWY serwis: nowy URL, utrata historii, ponowne wpisanie sekretów) oraz nazwa repo na GitHubie.
  **DŁUG POZOSTAŁY**: README wciąż używa 40-kowego słownictwa w opisach (28 wystąpień: „rytuał" ×16,
  „Katalog" ×5, „Puryfikacja" ×2, „Liturgie" ×2, „Sanktuarium", „Sanctity", „Noospheric") — część
  to legalne identyfikatory domenowe/backendowe, część to nieaktualne nazwy zakładek (UI ma dziś
  Kolekcja/Regał/Katalog/Synchronizacja/Rynek). Do rozdzielenia w osobnym PR.
- **1.80.0** — **Swipe do przełączania segmentów regału (mobile).** Nowy `src/hooks/useHorizontalSwipe.ts`
  (zwraca handlery touch do rozlania na element). Sedno nie w wykrywaniu gestu, tylko w NIE kradzeniu cudzych:
  (1) swipe liczy się tylko gdy poziomy dystans DOMINUJE nad pionowym (`|dx| > |dy| * 1.4`), więc zwykłe
  przewijanie strony nigdy nie przerzuci półki; (2) **nigdy nie wołamy `preventDefault` na `touchmove`** — to
  właśnie ono blokowałoby scroll (i omija problem pasywnych listenerów); (3) drugi palec = anulowanie (pinch-zoom
  zostaje przeglądarce); (4) próg 50 px i cap 800 ms, żeby wolne przeciąganie nie uchodziło za flick.
  `Shelf.tsx`: nawigacja stron wyciągnięta do `goPrev`/`goNext` — swipe i strzałki dzielą JEDNĄ implementację;
  gest wyłączony przy `pageCount === 1` i w trakcie drag&drop książki. Podpowiedź w `BookshelfSection`
  rozdzielona per breakpoint (mobile: „Przesuń palcem w bok…", desktop: dotychczasowa o strzałkach) — swipe jest
  nieodkrywalny bez napisania o nim. +9 testów (głównie przypadki, w których swipe NIE ma zadziałać). Suite 555
  zielone, lint czysty, build OK.
- **1.79.0** — **[SEC-PR7] Limity zasobów: rozmiar odpowiedzi + ograniczone cache.** (1) `scrapingClient`
  eksportuje `MAX_RESPONSE_BYTES` (12 MB) + `responseSizeLimit` (`maxContentLength`/`maxBodyLength`), wpięte we
  WSZYSTKIE 9 wywołań axiosa (Vinted ×4, ISBN ×4, OPAC ×1). Wcześniej żadne nie miało limitu — axios buforuje całe
  ciało w pamięci, a `withRetry` (do 6 prób) mnożył to razy sześć na 512 MB instancji. 12 MB jest CELOWO powyżej
  ~7 MB stron katalogu Vinted (patrz historia OOM) — chodzi o ucięcie przypadku patologicznego, nie normalnego
  ruchu. (2) Nowy `services/boundedCache.ts` (`BoundedCache`, FIFO z twardym capem) zastępuje nielimitowane
  `Map` w `cycleLookupService` (500 wpisów; klucz z `?title=`/`?author=`, a każde chybienie to do ~34 żądań do
  wiki) i `isbnLookupService` (2000; klucz = dowolny ISBN-13 z poprawną sumą kontrolną, trywialny do masowego
  generowania). FIFO nie LRU — świadomie, prostota nad hit-rate; `null` pozostaje legalną WARTOŚCIĄ (obecność
  przez `has()`, nie truthiness). +6 testów. Suite 546 zielone, lint czysty, build OK.
  **ŚWIADOMIE POMINIĘTE**: pinning certu OPAC przez `ca:` zamiast `rejectUnauthorized:false` — wymaga prawdziwego
  certyfikatu pośredniego, którego nie zweryfikuję z tego sandboxa, a wpisanie go na ślepo (plus wygasanie) grozi
  zepsuciem skanu bibliotecznego. Zostaje jako świadomy dług z uzasadnieniem.
- **1.78.0** — **[SEC-PR6] Nagłówki bezpieczeństwa + CSP.** `middleware/securityHeaders.ts` montowany PIERWSZY
  w `app.ts` (więc obejmuje też odpowiedzi 401/403/503 i statyczne SPA) + `app.disable("x-powered-by")`.
  Nagłówki: CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`
  (celowo NIE `no-referrer` — middleware CSRF używa `Referer` jako fallbacku). **Uczciwie o zakresie**: `script-src`
  zachowuje `'unsafe-inline'`, bo `index.html` niesie inline-bootstrap motywu/favicony (to on daje brak mignięcia),
  więc ta CSP **nie chroni realnie przed XSS** — i nie musi: audyt nie znalazł ŻADNEGO sinka HTML w `src/`.
  Realną wartość dają pozostałe dyrektywy: `frame-ancestors 'none'` (clickjacking — istotne właśnie przy włączonym
  Basic Auth), `form-action 'self'` (druga linia pod CSRF), `base-uri 'self'`, `object-src 'none'`,
  `connect-src 'self'`. Allow-listy odbijają to, co apka faktycznie ładuje: Google Fonts (`@import` w index.css)
  + miniatury Vinted (`*.vinted.net`) + `data:` (favicon SVG). **Zweryfikowane prawdziwą przeglądarką**
  (Chromium/Playwright na produkcyjnym buildzie): 0 naruszeń CSP, React montuje się, bootstrap motywu działa.
  +5 testów. Suite 540 zielone, lint czysty, build OK.
- **1.77.1** — **[SEC-PR5] Bundle backendu przestaje być serwowany publicznie.** Build wrzucał SPA **i**
  `server.cjs` do tego samego `dist/`, a `express.static(dist)` serwował katalog w całości → `GET /server.cjs`
  zwracał 1,7 MB kodu backendu (bez poświadczeń — sprawdzone — ale z pełną mapą tras i logiką walidacji).
  Teraz `vite build` → `dist/public/` (`build.outDir` + `emptyOutDir`), a statyczny root serwera to `dist/public`;
  `server.cjs` zostaje w `dist/`, poza zasięgiem. Zweryfikowane po rebuildzie: `dist/public/` zawiera tylko
  `index.html` + `assets/`. Docs zaktualizowane (README ×2, CLAUDE.md). Suite 535 zielone, lint czysty.
- **1.77.0** — **[SEC-PR4] Auth fail-closed w produkcji (koniec z cichym otwarciem).** `basicAuth` przestaje
  bezwarunkowo przepuszczać przy braku poświadczeń: dev/test = dalej no-op (wygoda lokalna), **produkcja bez
  `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD` = 503 na wszystko poza `/api/health`**. Powód: `render.yaml` deklaruje
  obie zmienne z `sync: false`, więc blueprint ich NIE dostarcza — świeży deploy wstawał otwarty i nic tego nie
  sygnalizowało. Świadome wystawienie publiczne nadal możliwe, ale wymaga jawnego `ALLOW_PUBLIC_ACCESS=true`
  (dokładnie „true"; „1" nie wystarcza) — zamiast pominięcia, którego nikt nie zauważa. Odmowa jest głośna, ale
  odwracalna (nie boot-failure): health probe dalej odpowiada, więc hosting nie flapuje usługi, a ustawienie
  zmiennych naprawia stan bez redeployu kodu. Zaktualizowane `.env.example`, `README.md` (tabela zmiennych +
  sekcja wdrożenia) i komentarz w `render.yaml`. +5 testów. Suite 535 zielone, lint czysty, build OK.
- **1.76.1** — **[SEC-PR3] Guard na destrukcyjny zapis schematu Notion.** `PATCH /api/notion/schema` PODMIENIA
  listę opcji w całości, więc usunięcie opcji czyści wartość we WSZYSTKICH wierszach; allow-lista typu nic o tym
  nie mówiła. Walidacja teraz przeciwko ŻYWEMU schematowi (`getNotionSchema()`), nie zaszytej liście kolumn
  (która by się rozjeżdżała): (1) kolumna musi ISTNIEĆ (koniec z dorzucaniem śmieciowych kolumn), (2) typ musi
  zgadzać się z faktycznym typem kolumny, (3) jedno żądanie może usunąć **maksymalnie 1 opcję**. Punkt (3) jest
  celowo policzony, nie „odrzuć pustą listę": UI kasuje opcje POJEDYNCZO, więc usunięcie ostatniej opcji legalnie
  daje pustą listę — blanket-blokada zepsułaby prawdziwą funkcję. +5 testów (masowe czyszczenie 3 opcji,
  usunięcie dokładnie jednej = przechodzi, nieznana kolumna, niezgodny typ). Suite 530 zielone, lint czysty.
- **1.76.0** — **[SEC-PR2] Ochrona CSRF (same-origin) na żądaniach zmieniających stan.** Nowy
  `middleware/sameOrigin.ts`, montowany w `app.ts` po `basicAuth`, przed `express.json()`. Dla
  POST/PUT/PATCH/DELETE: podany `Origin` musi mieć ten sam HOST co nasz `Host` (fallback na `Referer`);
  `Origin: null` i niepoprawne wartości = odrzucone (403). **Brak obu nagłówków = przepuszczamy** — świadomie:
  przeglądarka ZAWSZE wysyła `Origin` przy cross-origin POST (też z formularza), więc jego brak oznacza klienta
  nie-przeglądarkowego (curl, `scripts/importReadDates.ts`); blokowanie łamałoby legalny CLI nie zamykając
  żadnego ataku. Porównanie po HOŚCIE (nie pełnym origin), żeby terminacja TLS na proxy Rendera (https na
  zewnątrz, http wewnątrz) nie dawała false-reject; port jest częścią hosta, więc dev na innym porcie odpada.
  **Ten finding istniał WYŁĄCZNIE dzięki włączonemu Basic Auth** — poświadczenia Basic, inaczej niż ciasteczka
  `SameSite`, przeglądarka dokleja też do żądań cross-site, a rytuały bez ciała (`/api/sync-purify`,
  `/api/sync/stop`, `/api/sync/reset`) dało się odpalić auto-submitowanym formularzem. +9 testów. Suite 526
  zielone, lint czysty, build OK.
- **1.75.0** — **[SEC-PR1] Allow-lista hosta dla URL-i Vinted — zamyka SSRF + 6 sinków `href`.** Nowy
  `services/vintedUrl.ts`: `isVintedUrl` (host = `vinted.pl`/subdomeny, tylko http(s)) i `isVintedPhotoUrl`
  (+`vinted.net` dla CDN). Dopasowanie `h===base || h.endsWith("."+base)` — `evilvinted.pl` i
  `vinted.pl.attacker.com` odpadają. Wpięte: (1) `parseVintedData` waliduje KAŻDĄ ofertę na WYJŚCIU ze storage
  (`sanitizeStoredOffer`) — zły `url` = drop oferty, zły `photo`/`seller` = drop pola; (2) `offerFromItem` zwraca
  `null` dla obcego hosta (obrona w głąb na wejściu; caller filtruje); (3) filtr przed re-fetchem w
  `vintedSyncService` z testu PODCIĄGU `/\/items\//` → `isVintedUrl(url) && url.includes("/items/")`. To był
  realny wektor: `http://169.254.169.254/items/` przechodził stary filtr i był pobierany z wnętrza Rendera
  z ciasteczkiem `cf_clearance`. +15 testów (m.in. dokładne cele SSRF, suffix-confusion, `javascript:`).
  Fixture'y z atrapami URL (`"u"`, `"u1"`) w `vintedStore.test`/`marketStats.test` urealnione — nigdy nie były
  poprawnymi danymi Vinted. Suite 517 zielone, lint czysty, build OK.
- **1.74.3** — **Świece nad regałem = potrójny klaster (taki był zamysł).** Pojedyncza `WaxCandle` zamieniona z
  powrotem na `CandleCluster` (3 świece), przywrócone `VARIANTS`. Cluster skalowany przez wymiary SVG (nie
  transform) → precyzyjne osadzenie tuż nad gzymsem (`-top-[60px]`, scale 0.42); glow skalowany z rozmiarem.
  Wariant + pozycja pozioma (`left-1/4…1/2`) z hasha `shelfId` — sąsiednie regały różnią się układem i miejscem,
  nie kolidują z nagłówkiem. Tło sali dalej czyste, ciemny 40k bez zmian. Suite 502 zielone, lint czysty, build OK.
- **1.74.2** — **Świece: klastry z tła usunięte, świeca przeniesiona nad górną ramkę regału.** Dwa duże klastry
  narożne w `RoomDecor` (boho) USUNIĘTE (+ martwy `CandleCluster`/`VARIANTS`); ciemny 40k zachowuje kinkiety.
  Per-regał `WaxCandle` skalowana teraz przez wymiary SVG (nie transform) → precyzyjne pozycjonowanie; siedzi tuż
  NAD gzymsem (`-top-[47px]`, scale 0.62 ≈ rozmiar z „czerwonych kwadratów"), w zróżnicowanym, BEZPIECZNYM pasie
  poziomym (`left-1/4…2/3` z hasha `shelfId`) — nie koliduje z ikoną/tytułem/pagerem i sąsiednie regały różnią się
  miejscem + grubością. Suite 502 zielone, lint czysty, build OK. Parametryczny
  `Candle` (grubość `w`, ton, wysokość; płomień skalowany girth) + `CandleCluster` z 3 wariantami układu (różny
  ton/wysokość/GRUBOŚĆ → dwa miejsca nigdy nie wyglądają jak lustrzane odbicie) i pojedynczy `WaxCandle`. Rogi
  sali: `variant 0` (lewa) vs `variant 1` + inny offset/scale (prawa) — koniec `flip`-mirror. Cienka świeczka nad
  każdym regałem (`Shelf`) → w boho zastąpiona grubym kapiącym `WaxCandle` (scale 0.6), z tonem/grubością/pozycją
  wyprowadzonymi z hasha `shelfId` (sąsiednie regały różnią się objętością i miejscem); ciemny 40k zachowuje
  cienką świeczkę (`.dc-40k`). Tempo płomienia dalej z knoba `flameSpeed`. Suite 502 zielone, lint czysty, build OK. Trzy pokrętła (`ui`): `shelfRoomShade` (siła cieni/
  winiety sali, 0–200%), `candleGlow` (poświata świec, 0–200%), `flameSpeed` (tempo migotania, 50–200%, wyżej=
  szybciej); default 100. Schema + clamps w `src/configSchema.ts`; edytory (NumberField) w „Kalibracji"
  (`ConfigSection`). Konsumpcja: alpha cieni/poświaty przez `calc(.X * var(--knob-*, 1))` w `index.css` (jasny
  skin) — JS ustawia `--knob-room-shade`/`--knob-candle-glow` na `RoomDecor` z wartości % (mnożnik = %/100);
  `flameSpeed` jako mnożnik dzielący czasy animacji płomieni/glow w `CandleCluster`. Zero migracji (nowe knoby
  dziedziczą default; storage = tylko diff). Suite 502 zielone, lint czysty, build OK (knoby w bundlu).
  Diagnoza: `--sk-room-bg` w boho był JUŻ jasny (len) — ciemne wrażenie robiły twarde czarne cienie/winieta/
  podłoga w `RoomDecor` (`rgba(0,0,0,.5–.85)`), zwł. dolny pas. (1) Tło → putty/taupe C (`#d9c9ac→#c3ae8b`),
  ciepła oprawa regału; czarne cienie na zmiennych `--sk-room-topshade/-floorshade/-vignette` (fallback = ciemna
  wartość 40k, boho = miękkie ciepłe `rgba(58,52,43,.10–.20)`). (2) Świece: nowy `CandleCluster` (Ś3) — 3 grube
  świece różnej wysokości (kość/glinka/wosk pszczeli) ze spływami wosku, roztopionym rondem i kałużą; płomienie
  WIĘKSZE i WOLNIEJSZE (motion `transformBox:fill-box`, dur 3.8–4.4 s, glow 4.6 s). Widoczne TYLKO w boho przez
  nową klasę `.candle-boho` (odwrotność `.dc-40k`); ciemny motyw zachowuje dotychczasowy cienki kinkiet 40k —
  nietknięty. Makieta 4 tła + 3 świece pokazana userowi → wybór C + Ś3. Suite 502 zielone, lint czysty, build OK. Twarde czarne cienie z
  drewna 40k (`rgba(0,0,0,.6–.85)`) czytały się na lnie jak brud: halo pod tytułem gzymsu + czarny inset „wchodzący
  do wnętrza" regału. Przeniesione na zmienne `--sk-*` z FALLBACKIEM = obecna wartość ciemna (40k bez zmian) i
  NADPISANIEM w jasnej skórze = wariant C: miękkie, CIEPŁE cienie NA ZEWNĄTRZ. Nowe zmienne (`ShelfFrame` +
  `ShelfDivider`): `--sk-frame-drop` (miękki ciepły cień pod regałem), `--sk-cornice-shadow`/`--sk-well-shadow`
  (delikatny ciepły inset zamiast czarnego mułu), `--sk-title-shadow: none` (tytuł bez halo), `--sk-plate-drop`
  (plakietka „siada" ciepłym cieniem) + `--sk-plate-glow: none` + `--sk-plate-text-shadow: none`. Cogi/holo/HUD i
  tak ukryte w boho (`.dc-40k display:none`), więc ich cienie pominięte. Makieta 4 wariantów pokazana userowi →
  wybór C. Suite 502 zielone, lint czysty, build OK (zmienne w bundlu). Karetka wstawiania
  (poprawne/niepoprawne miejsce, `ShelfRow`) niosła inline `rgba` (valid=CYAN, invalid=rose) → nie remapowała się
  wcale. Teraz klasy `.drop-caret-valid/invalid`: ciemny = żywe (emerald/rose), boho = ciepła leśna zieleń
  `rgba(107,142,62)` / terakota `rgba(180,74,56)` — widoczne na lnie. Semantyka zielony=OK zamiast cyan.
  **Sweep** arbitralnych/inline poświat, które nie przechodzą przez `--color-*`: (a) glow ramki-regału-celu
  (`ShelfFrame` emerald/cyan/purple, 28px) → klasy `.shelf-glow-*` (ciemny dokładny, boho szałwia/glinka);
  (b) przycisk „na górę" (App) i badge schematu (SchemaColumnCard) → `hl-glow-cyan`. ŚWIADOMIE zostawione:
  linia lasera skanera (ScanModal — leży na ciemnym podglądzie kamery, nie na lnie) i glow tytułu LIBREM (App:71 —
  już tylko w motywie ciemnym). Suite 502 zielone, lint czysty, build OK (klasy w bundlu). Root-cause: arbitralne
  `shadow-[0_0_..px_rgba(..)]` niosą literalne RGB i NIE przechodzą przez remap `--color-*`, więc w jasnym motywie
  zostawały NEONOWE (cyan/purple) na glinianym wypełnieniu (fill już się remapował → zgrzyt fill vs poświata).
  Fix: semantyczne klasy `.hl-glow-{cyan,amber,purple,rose,cyan-strong}` w `index.css` — CIEMNY = dokładnie
  dotychczasowe rgba (40k bez zmian), JASNY = ekwiwalent boho (clay/ochre/sage/brick). Podpięte: zakładki
  (App.tsx ×5), przycisk „Zapisz" (ConfigSection), puls kontroli spójności (IntegrityCheckCard →
  `hl-glow-cyan-strong`). Dodatkowo naprawione DWA kontrolki mieszające hue wewnątrz siebie: toggle układania kart
  (`StatsSection` — hover cyan→amber, zgodny z aktywnym amber) i drop-target masonry (`StatsMasonry` — cyan→amber).
  Reszta przycisków była już wewnętrznie spójna (fill+hover+tekst z jednego koloru). Suite 502 zielone, lint
  czysty, build OK (klasy obecne w bundlu). MOŻLIWE dalej (opcjonalnie): focus-ring inputów (wszystkie cyan) +
  segmentowe toggle na wspólny akcent sekcji — jeśli user zechce pełniejszego pokrycia.
- **1.72.0** — **[RD-PR4] Karta „Tempo czytania" (frontend).** `ReadingPaceCard` na zakładce statystyk (span2,
  obok „Osi czasu"), konsumuje `stats.readingStats`. 3 kafle KPI: „W tym roku" (+ delta vs ubiegły, ↑emerald/
  ↓slate), „Książek/rok" (recentPace), „Z datą łącznie" (totalDated); histogram roczny (słupek = przeczytane w
  danym roku, bieżący rok + rekord podświetlone), stopka „X/Y przeczytanych ma datę" gdy niepełne pokrycie. Puste
  → zachęta do oznaczania. Paleta jak `DecadeHistogram` (amber nagłówek/rekord, cyan słupki, slate track) → auto-
  adaptacja w obu skórach przez remap zmiennych. `ReadingStats`/`ReadingYearCount` dodane do re-eksportu w
  `useStats`; karta wpięta do rejestru w `StatsSection` (nowe id „readingPace" dopina się na końcu zapisanego
  układu — istniejący userzy je zobaczą). Suite 502 zielone, lint czysty, build OK. **Feature „tempo czytania"
  domknięty w podstawie**; opcjonalnie później: prognoza domknięcia kolekcji (recentPace + brakujące award-booki),
  streaki, surfacing daty na karcie książki. `computeReadingStats` w
  `statsAggregator` liczy przeczytane **award-booki wg ROKU** z `dataPrzeczytania` (granularność roczna
  ŚWIADOMA: daty rok-only to `YYYY-01-01`, więc rozbicie miesięczne wymyśliłoby szpic w styczniu — liczymy tylko
  rok). Zwraca: `perYear` (rosnąco), `totalRead` vs `totalDated` (ile historii ma datę), `thisYear`/`lastYear`,
  `bestYear` (szczyt), `recentPace` (śr. książek/rok po ukończonych latach od startu, cap 3, bieżący rok wyłączony).
  `now` wstrzykiwane (testowalność). Typ `ReadingStats` w `src/types/stats.ts` + `Stats.readingStats`; wpięte w
  `statsService.getStats`. +6 testów. Suite 502 zielone. **NASTĘPNE (RD-PR4, frontend)**: karta „Tempo czytania"
  na zakładce statystyk (KPI przeczytane w tym roku + delta, recentPace, wykres roczny à la `DecadeHistogram`);
  potem ew. prognoza domknięcia kolekcji (recentPace + brakujące award-booki) i streaki.
- **1.70.0** — **[RD-PR2] Jednorazowy import dat przeczytania z CSV (helpery + skrypt).** Czysta,
  przetestowana logika w `services/readDateImport.ts`: `parseReadDate` (rozpoznaje `dd.mm.yyyy` / `yyyy-mm-dd` /
  `yyyy-mm` / `mm.yyyy` / `yyyy`; daty częściowe przyklejane do początku okresu — miesiąc `-01`, rok `-01-01`),
  `parseImportCsv` (średnik + BOM + nagłówek), `buildReadDatePlan` (dwustopniowe dopasowanie: exact `robustBookKey`
  autor+tytuł, potem fallback po UNIKALNYM tytule — nigdy nie wymyśla wiersza; zwija duplikaty biorąc NAJWCZEŚNIEJSZĄ
  datę; pomija już-datowane bez `--overwrite`). Skrypt `scripts/importReadDates.ts` (poza appem): DRY-RUN domyślnie,
  `--apply` zapisuje przez `setReadDate`, `--overwrite` nadpisuje. Wymaga NOTION_* w env. +14 testów. Zweryfikowane
  na realnym CSV usera (712 wierszy: 473 dzień / 19 miesiąc / 220 rok, zero nierozpoznanych, zakres 1993→2026).
  UWAGA: właściwy import (queryAllBooks + zapis) user robi u siebie — sandbox nie ma kluczy Notion.
- **1.69.0** — **[RD-PR1] Struktura kolumny „Data przeczytania" (warstwa 1/N feature „tempo czytania").**
  Pierwsza właściwość typu `date` w bazie — brak istniejącej konwencji, użyto natywnego kształtu SDK
  (`{ date: { start } }` / `{ date: null }`, odczyt `prop.date?.start`). (1) `requiredProps` w
  `schemaValidationService` +`{ name:"Data przeczytania", type:"date" }` (po `Źródło`); `updateDatabaseProperty`
  obsługuje `date` bez zmian. (2) `NotionProperty.date` + `NotionBook.dataPrzeczytania?` (src/types.ts);
  `notionMapper` czyta `dataPrzeczytania` (undefined gdy brak). (3) Adapter `setReadDate(pageId, date|null)` (wzór
  `updateLp` + `invalidateBooksCache`). (4) Ścieżka zapisu: `syncManager.markAsRead` stempluje `todayIso()` (UTC,
  dzień), `unmarkRead` czyści — **tylko** gdy `tag==="Przeczytane"` (tagi `Biblioteka*`/`Posiadam` nie ruszają
  daty). Łapane od teraz w przód (historii nie da się cofnąć). Edge: re-mark już-przeczytanej re-stempluje dziś —
  UI oznacza tylko na przejściu unread→read, więc w praktyce nie zachodzi. (5) `docs/schema-validation.md` lista
  required-props doprowadzona do zgodności z kodem (brakowało Źródło/Kategoria/Cykl/CyklNr/VintedData/ShelfOrder/
  ISBN). +7 testów (adapter setReadDate ×3, mapper ×2, schema ×1, syncManager gating ×4 — netto). Suite 482
  zielone, lint czysty, build OK. **NASTĘPNE (osobne PR)**: statystyki velocity (przeczytane/rok, tempo, prognoza,
  streaki) czytające `dataPrzeczytania` w `statsService`/`statsAggregator`; ew. surfacing daty na regale/karcie.
- **1.68.1** — **Przełącznik motywu: pigułka z tekstem → dyskretna ikona księżyc/słońce.** W nagłówku (prawy górny
  róg) zamiast „pigułki" `ikona + Ciemny/Jasny` jest teraz okrągły przycisk 40×40 tylko z ikoną: księżyc w jasnym
  (→ ciemny), słońce (amber) w ciemnym (→ jasny), z delikatną animacją obrotu przy zmianie (`AnimatePresence`,
  rotate ±90°). Styl dopasowany do obu motywów (boho: `#fbf6ec`/`#e4d9c4`/glinka hover; 40k: slate/cyan). Etykiety
  `title`/`aria-label` zachowane (dostępność ikony-przycisku). Tylko `src/App.tsx`. Suite 475 zielone, lint czysty.
- **1.68.0** — **Favicon zależny od motywu (boho/40k).** Favicon podąża za jawnym przełącznikiem `data-theme`
  (NIE za `prefers-color-scheme` — apka rozłącza motyw od OS, więc trik `<link media>` byłby niespójny).
  Dwie ikony (ten sam emblemat-kompas dla rozpoznawalności karty, różna paleta): **light/boho** = kremowe tło
  `#FBF6EC`, atrament `#3A342B`, glinka `#C07A56` w rdzeniu; **dark/40k** = dotychczasowa (slate `#020617`, cyan
  `#22d3ee`, fiolet `#a855f7`). Obie ikony + wiring DOM to JEDNO źródło prawdy w inline-skrypcie `index.html`
  (`window.__setFavicon`) — ustawiane przed mountem Reacta ⇒ zero mignięcia (spójne z ustawianiem motywu tam);
  statyczny `<link id="favicon">` domyślnie boho (fallback bez JS). `src/utils/favicon.ts` (`applyFavicon`) tylko
  przekazuje aktywny motyw z efektu `useTheme` przy każdym toggle. +2 testy (`favicon.test.ts`). Suite 475
  zielone, lint czysty, build OK.
- **1.67.13** — **[Tier 4, PR5] Adapter schema-methods bez wyciekającego id (warstwowanie).**
  `notion.adapter.ts`: `retrieveDataSource()`/`updateDatabaseProperty(name,type)`/`renameProperty(old,new)` gubią
  vestigialny parametr `databaseId`/`dataSourceId` i celują wewnętrznie w `this.actualDataSourceId!`; usunięto
  `resolveDataSourceId` (był tylko przelotem przez `init()`). Naprawia realny bug: metody brały przekazane id, więc
  gdyby wywołujący podał surowe `databaseId` w trybie data-source, update poszedłby na złe źródło — teraz nie ma
  jak. `schemaValidationService` traci odczyt `process.env.NOTION_DATABASE_ID` + `resolveDataSourceId`;
  `cyclesSyncService` traci martwy `resolveDataSourceId` (wynik nigdy nieużywany). Testy zaktualizowane (bez
  `'actual-id'`/`'test-ds-id'` jako 1. arg). Zero zmiany zachowania. Suite 473 zielone, lint czysty, build OK.
  **Tier 4 (i cały przegląd architektury) zamknięty**; kosmetyczne renamy (`useConfig`, `SanctityDebugger`,
  relokacja `isbn.ts`) świadomie pominięte jako low-value churn.
- **1.67.12** — **[Tier 4, PR4] Typowanie `useSyncManager` + relokacja typów domenowych stats.** (1) `sync: any`/
  `FULL_SYNC_STEPS[].sync: any`/`clearOthers(any)`/`handleSyncAction(any)` → `type SyncInstance =
  ReturnType<typeof useSync>` (kontrakt rytuału już nie wymazany). Payloady wyników zostają `any[]` (heterogen).
  (2) ~85 linii interfejsów domenowych przeniesione z `useStats.ts` do nowego `src/types/stats.ts`; `useStats`
  re-eksportuje je (back-compat), a dwa hooki sięgające po TYP do sąsiedniego hooka (`useLibraryCheck`,
  `useMarkAsRead` — `IdentifiedBooks`) importują teraz z `../types/stats`. Zero zmiany zachowania. Suite 473
  zielone, lint czysty, build OK.
- **1.67.11** — **[Tier 4, PR3] Wspólne prymitywy request w hookach.** `src/utils/http.ts`: `markReadRequest`
  (jeden transport mark/unmark — dotąd 3 kopie: `useMarkRead`, `useMarkAsRead`, `useCyclesHarvest`; każdy hook
  nakłada swój optimistic/lock/error) + `postStop` (fire-and-forget POST `/stop` — dotąd 3 kopie w
  `useVintedCheck`/`useLibraryCheck`/`useVintedResolveSellers`). `useSync.stopSync` zostawiony bez zmian —
  ma dodatkową logikę (czyta `data.success`). Zachowane komunikaty błędów (fallbacki per-caller). Suite 473
  zielone, lint czysty, build OK.
- **1.67.10** — **[Tier 4, PR2] Kontroler: wspólny guard kluczy + walidacja tagu + strukturalne logi.**
  `requireNotionKeys(res)` zastępuje 4× skopiowany guard `NOTION_API_KEY`/`DATABASE_ID` (runSync/checkVinted/
  resolveVinted/getVintedStored). `resolveSourceTag(tag)` zastępuje 2× zdublowaną walidację `ALLOWED_SOURCE_TAGS`
  (mark/unmark). 6× `console.error` → strukturalny `log.error` (stats/books/wikiLastUpdate/notionSchema/mark/
  unmark) — spójne z resztą kontrolera. Zero zmiany zachowania (te same statusy/komunikaty). Suite 473 zielone,
  lint czysty, build OK.
- **1.67.9** — **[Tier 4, PR1] Backend higiena: martwy kod + cykl importów + logger + nieużywana zależność.**
  (1) Usunięty martwy `WikiAdapter.fetchPageContentWithSlots` (zero prod-wywołań, łamał kontrakt błędu —
  zwracał `""` zamiast rzucać) + jego test i mock w `server.test`. (2) Cykl `vintedSession ↔ browserPrime`
  zerwany: `parseSetCookie` → nowy `services/cookies.ts` (re-export z `vintedSession` dla kompatybilności;
  `browserPrime` importuje z `cookies`). (3) `console.*` → strukturalny `createLogger` w `duplicateSyncService`
  (drop 2 debug, 1 → `log.info`) i `lpSyncService` (`log.error`). (4) `DuplicateSyncService` — usunięta
  nieużywana zależność `WikiAdapter` (konstruktor + wiring w `syncManager` + test). Suite 473 zielone (−1 =
  usunięty test martwego kodu), lint czysty, build OK.
- **1.67.8** — **[Tier 3, A3] `BookshelfSection` — kolejka zapisów/optymistyka → `useShelfMutations`.** Z ciała
  komponentu wyniesione: serializowana kolejka „latest-wins" per książka (`pendingRef`/`runningRef`, guard na
  nieatomowy `mutateMultiSelect`), optymistyczne overrides „przeczytane" + rollback, optymistyczny zapis
  kolejności (`applyOrderPlan` + `saveOrders` + rollback) i wspólny `moveError`. Komponent renderuje i wiąże
  callbacki; czyste helpery (`planInsertion`/`splitShelves`/`featuredReads`) były już wyciągnięte. 236→177
  linii. Zero zmiany zachowania. Suite 474 zielone, lint czysty, build OK. **Tier 3 zamknięty** (statsAggregator
  + A4 + A2a/A2b + A3).
- **1.67.7** — **[Tier 3, A2b] Masonry + drag&drop `StatsSection` → `StatsMasonry` + `useCardReorder`.** Silnik
  układu (kolumny wg breakpointu, round-robin, segmenty span2, `renderCard` z DnD) i stan reorderu (arranging/
  drag/hover + `persistStatsOrder`/`moveId`/reset) wyniesione z komponentu-sekcji. `StatsSection` = sama
  kompozycja (372→**148 linii** łącznie z A2a). Zero zmiany zachowania. Suite 474 zielone, lint czysty, build
  OK. (Zamyka A2 — StatsSection zdekomponowany.)
- **1.67.6** — **[Tier 3, A2a] Ekstrakcja 6 inline kart `StatsSection` do komponentów `stats/`.** Karty
  authors/awards/yearly/ownedUnread/library/identified były pisane ręcznie inline (powielony nagłówek), gdy
  reszta to komponenty. Wyciągnięte VERBATIM: `AuthorsCard`, `AwardsProgressCard`, `YearlyCard`,
  `OwnedUnreadCard`, `LibraryProgressCard`, `IdentifiedLibraryCard` (typy propsów przez `React.ComponentProps`
  z item-komponentów → bezpieczne). `StatsSection` 372→244 linie; wszystkie karty jednorodne. Zero zmiany
  zachowania. Suite 474 zielone, lint czysty, build OK. (A2b — wyniesienie masonry+DnD do hooka — osobno.)
- **1.67.5** — **[Tier 3, A4] Wspólny selektor `IntegrityCheckResult`→display (`src/utils/integrityDiff.ts`).**
  Derywacja diffów była zduplikowana w `IntegrityCheckCard` i `SanctityDebugger` (oba czytają ten sam
  `result`). Wyciągnięte VERBATIM: `hasInconsistencies`, `toDiffPanels` (strukturalne panele dla debuggera),
  `yearDiffLines`/`awardDiffLines` (spłaszczone linie dla karty). Oba komponenty konsumują util. Zero zmiany
  zachowania. Suite 474 zielone, lint czysty, build OK.
- **1.67.4** — **[Tier 3] `StatsService.getStats` (~200-liniowa god-metoda) → czysty `statsAggregator.ts`.**
  11 agregacji (author/awardBooks/ownedUnread/awardCoverage/allAwards/availability/publisher/series/cycle/
  decade/yearly/library) wyciągnięte VERBATIM jako czyste `books[] → stat` (dołączają do istniejącego
  `computeMarketStats`). `StatsService` to teraz fetch → filtr (award + niepusty plTitle) → delegacja →
  złożenie (209→42 linie). Zero zmiany zachowania — test `statsService.test` (end-to-end przez getStats)
  zielony bez zmian. Suite 474 zielone, lint czysty, build OK.
- **1.67.3** — **[Tier 2] Frontend I/O we właściwej warstwie (reużycie prymitywów).** (1) `useVintedResolveSellers`
  re-implementował pętlę SSE (własny `createStallWatchdog`+fetch+`consumeSSE`+komunikat stall) — jedyne jawne
  złamanie reguły „transport SSE żyje raz w `useSSEStream`". Przepisany na `useSSEStream("/api/vinted-resolve-
  sellers", {timeoutMs:120000})`, jak `useVintedCheck` — zostało tylko routowanie eventów. Komunikat stall
  teraz z `defaultStallMessage` (wspólny). (2) `SearchSection` fetchował inline (`fetchWithTimeout` +
  `/api/books?fresh=1` + `/api/isbn/…`) — jedyny komponent robiący I/O. Wyciągnięte: `src/utils/http.ts`
  (`fetchWithTimeout`), `useBooks.refetchFresh()` (świeży indeks, bypass cache, hard timeout — I/O należy do
  useBooks), `useIsbnLookup` (resolve ISBN→tytuł). `handleScanDetect` to teraz samo UI-wiring (zachowane
  komunikaty/fallback do indeksu in-memory). Suite 474 zielone, lint czysty, build OK.
- **1.67.2** — **[Tier 1, PR2] Wspólny `services/bookMatch.ts` (klucz tożsamości + scoring duplikatów) — BEZ
  zmiany reguł.** Konsolidacja rozproszonej logiki dopasowywania rekordów, ale zachowawczo (wybór usera: „tylko
  bezpieczna część"). Trzy prymitywy przeniesione VERBATIM: `robustBookKey` (kanoniczny klucz — z
  `integrityService.robustKey`), `scoreDuplicatePair` (pełny 7-regułowy audyt — z `duplicateSyncService`),
  `isInsertDuplicate` (lekki insert-guard — z `bookSyncService`). Konsumenci: integrity → `robustBookKey`,
  `duplicateSyncService` → `scoreDuplicatePair`, `bookSyncService` → `isInsertDuplicate` (usunięte lokalne
  `calculateSimilarity`/`countCommonWords`/`normalizeData` gdzie zbędne). Dwie strategie duplikatów zostają
  osobne CELOWO (insert-guard vs audyt odpowiadają na różne pytania). **Konwergencja klucza lookup w ścieżce
  sync na `robustBookKey` ŚWIADOMIE odłożona** — zmieniłaby, które rekordy się matchują (ryzyko duplikatów w
  Notion). +10 testów `bookMatch` (blokują bieżące reguły). Suite 474 zielone, lint czysty, build OK. ZOSTAJE
  z Tier 1: divergent normalizery klucza sync (odłożone jw.).
- **1.67.1** — **[Przegląd architektury — Tier 1, PR1] FIX: kontrola spójności czyta listę nagród z configu +
  wspólne źródło stron nagród.** Bug: `IntegrityService` miał zahardkodowaną `PREDEFINED_AWARDS`, więc nagroda
  dodana w Ustawieniach NIE była sprawdzana. Fix: czyta `config.sync.awards` (jak `bookSyncService` i
  `runDiagnostics`). Dla domyślnej konfiguracji lista jest identyczna → zero zmiany dla dotychczasowych; dla
  własnych nagród — teraz poprawnie. Przy okazji SRP: nowy `services/awardBooksSource.ts` (`fetchAwardPage` /
  `fetchAwardBooks`) jako JEDNO źródło „pobierz+sparsuj strony nagród"; `bookSyncService.fetchBooksFromMediaWiki`
  to teraz cienki pass-through, `IntegrityService` NIE tworzy już własnej instancji `BookSyncService`, a
  `runDiagnostics` woła `fetchAwardPage` zamiast sięgać w serwis sync. Kontrakt „brak danych vs błąd infra"
  zachowany (`fetchPageContent` → "" dla braku strony, rzuca przy sieci). +1 test (integrity fetchuje custom
  nagrodę z configu, nie hardcoded). Suite 464 zielone, lint czysty, build OK.
- **1.67.0** — **Kolekcja: nagłówkowy rząd 4 KPI (makieta) — responsywny desktop + mobile.** Nowy `KpiRow`
  (`src/components/stats/KpiRow.tsx`) nad kartami, STAŁY (nie wchodzi w masonry z drag&drop — kolejność kart
  zachowana). 4 KPI z `Stats`: **Woluminy** = `awardBooksStats.total`; **Przeczytane** = `read/total%` (+pasek);
  **Posiadane** = Σ`decadeStats.owned`; **Do zdobycia** = `total − Σowned` (clamp ≥0). Layout: `grid grid-cols-2
  md:grid-cols-4` → desktop 4 w rzędzie, mobile 2×2; liczby `font-display tabular-nums` `text-3xl md:text-4xl`
  (serif w jasnym = makieta). Kolory/tło/pasek przez klasy palety (`text-slate-100`/`emerald`/`cyan`/`amber`,
  `bg-slate-800` track) → spójne w obu motywach automatycznie. Wpięte w `StatsSection` nad hintem układania,
  po guardach `!stats`. Suite 463 zielone, lint czysty, build OK. (Karty poniżej — histogram/dostępność/oficyny
  itd. — bez zmian; masonry z reorderem zostaje.)
- **1.66.1** — **Jasny Regał: pieczęcie nagród w palecie boho + fix zjadanej prawej strzałki pagera.**
  (1) Kropki nagród na grzbiecie (`AWARD_MARKS`: Hugo #fbbf24 / Nebula #c084fc / Locus #38bdf8 — neon) dostały
  klasy `spine-award spine-award-<key>`; w jasnym motywie `[data-theme="light"] .skin-noospheric .spine-award*`
  nadpisuje je (`!important` bije inline) na boho: Hugo→ochra `#CE9B3F`, Nebula→sage `#7E8A6B`, Locus→clay
  `#C07A56`, cienki ciemny pierścień bez poświaty. Ciemny motyw = neon bez zmian. (2) Pager „Regał N / M" był
  ucinany z prawej przy większym M: w jasnym `DataTicker` (elastyczny spacer `flex-1`) jest `display:none`, więc
  `whitespace-nowrap` tytuł nie oddawał miejsca, a `overflow-hidden` kornisza zjadał prawą strzałkę. Fix w
  `ShelfFrame`: tytuł `truncate min-w-0` (oddaje miejsce), chip licznika i wrapper `headerExtra` → `shrink-0`
  (pager zawsze w całości). Działa też w ciemnym. Suite 463 zielone, lint czysty, build OK.
- **1.66.0** — **Jasny Regał: kolory grzbietów z makiety + usunięcie 40k + czytelny kremowy tytuł.** (1) Nowa
  `LIGHT_SPINE_PALETTE` (12 boho mid-tone: clay/sage/ochre/brick/tany) równoległa do `CLOTH_PALETTE`; `spineStyle`
  zwraca `light`, komponenty emitują `--spine-light` (BookSpine/BookStack) i `--cml-a/b` (CoverCard). Warstwa
  `[data-theme="light"] .skin-noospheric .book-spine/.stack-layer/.cover-card` renderuje jaśniejsze grzbiety/
  okładki z tej palety (ciemny motyw = jewel-tone bez zmian). (2) **Bez 40k w jasnym**: ornamenty/efekty dostały
  klasę-marker `dc-40k` (CogSigil, NoosphericCrest, DataTicker, HoloField, HudCorner, CogMark-watermark, świeca+
  płomień, pyłki) → `[data-theme="light"] .dc-40k,.noo-data { display:none }`. Czysty, boho regał (ramka/deski/
  „pokój" zostają, warm). (3) **Tytuł na grzbiecie**: `[data-theme="light"] .skin-noospheric .spine-title` →
  kremowa biel `#FBF3E6` + mocny cień = czytelny na jasnym grzbiecie (zamiast bieli zlewającej się z tłem).
  Fix testu: literał `SpineStyle` w `bookshelf.test.ts` dostał pole `light`. Suite 463 zielone, lint czysty,
  build OK.
- **1.65.0** — **Regał w jasnym motywie = jeden wygląd (jak z makiety), bez przełącznika skór.** Skóry różnią się
  grzbietami: `.skin-holo` = neon (`APP_PALETTE`), `.skin-noospheric` = matowe jewel-tone (`CLOTH_PALETTE`).
  Makieta jest matowa → w jasnym motywie **wymuszamy `noospheric`** (`renderedSkin = theme==='light' ?
  'noospheric' : skin`) i **chowamy przełącznik „Skóra"** (`theme !== 'light'`). Zapisany wybór skóry ZOSTAJE
  dla motywu ciemnego (nie nadpisujemy `skin`, tylko klasę renderowaną). `BookshelfSection` używa teraz
  `useTheme`. Efekt: jasny regał ma spójne matowe grzbiety + ciepłą lnianą oprawę (bez neonu), ciemny „Warhammer"
  zachowuje Holo+/Klasyczny do wyboru. Suite 463 zielone, lint czysty, build OK.
- **1.64.0** — **Katalog: tytuły wyników na serif (Cormorant) w jasnym motywie — podpis makiety.** Weryfikacja:
  `BookResultCard`/`HighlightedText`/`ScanModal` używają wyłącznie klas palety (cyan/emerald/blue/amber/purple/
  rose/slate + alpha) → repaint 1.62.0/1.63.0 już je ocieplił, BEZ twardych ciemnych przecieków (inaczej niż
  skóry Regału). Jedyny brakujący „makietowy" detal: tytuły książek makiety są serifowe (Cormorant) — dodane
  `.result-title` na tytule wyniku + reguła `[data-theme="light"] .result-title { font-family: var(--font-
  display); … }` (tylko jasny; ciemny „Warhammer" zostaje na sans). Laser skanera w `ScanModal` zostaje cyan —
  jest nad ciemnym obrazem z kamery, więc czyta się dobrze w obu motywach (nie ruszamy arbitralnego shadow).
  Suite 463 zielone, lint czysty, build OK. Status repaintu: Kolekcja ✅ / Regał ✅ / Katalog ✅; zostają Rynek
  (bazowo pokryty repaintem) i opcjonalny re-layout Kolekcji 1:1.
- **1.63.0** — **Regał: jasny wariant skór + FIX kontrastu nagłówków sekcji.** (1) Skóry regału (`.skin-holo`/
  `.skin-noospheric`) niosą własne, twarde gradienty ciemnego drewna/neonu w `--sk-*`/`--noo-*` — NIE przechodzą
  przez `--color-*`, więc w jasnym motywie regał zostawał ciemny na papierze. Dodana warstwa
  `[data-theme="light"] .skin-*` nadpisuje wspólne `--sk-*`/`--noo-*` dla OBU skór → ciepły, jasny regał (len +
  jasny dąb, plate/board/cog/plinth/foot + „pokój" RoomDecor + poświata) wg `design/Regal.dc.html`. Grzbiety
  (jewel-tone z `CLOTH_PALETTE`) zostają — czytają się jak realne książki na lnie; gwiazdka „Wyróżnione" →
  clay. (2) **FIX (regresja z 1.62.0):** repaint 1.62.0 mapował tylko shade'y `--color-*-400..700`, więc
  nagłówki sekcji używające `text-*-100/90` (Katalog/Regał/Rynek/Synchronizacja h2, kornisz ShelfFrame) spadały
  na jasne defaulty Tailwinda → prawie niewidoczne na papierze. Dodane GŁĘBOKIE tony `--color-*-100/200/300`
  (w tej apce te shade'y są używane WYŁĄCZNIE jako kolor tekstu, nie tła — zweryfikowane grepem) → nagłówki i
  etykiety znów czytelne. Suite 463 zielone, lint czysty, build OK. NASTĘPNE: kolejna zakładka albo re-layout.
- **1.62.0** — **Jasny motyw: spójny repaint boho przez zmienne koloru Tailwinda (start dopieszczania od „Kolekcji").**
  Zamiast dziesiątek per-utility remapów, warstwa `:root[data-theme="light"]` nadpisuje teraz **`--color-*`**
  Tailwinda — przez które przechodzą WSZYSTKIE utility: `bg/text/border/from/via/to` **oraz** warianty alpha
  `…/NN` (color-mix). Efekt: gradienty, wypełnienia pasków (ProgressBar, histogram dekad, publishing) i pigułki
  robią się lniane naraz (wcześniej remapowane były tylko płaskie kolory → gradienty zostawały cyan/blue).
  Mapowanie rodzin na paletę makiety: cyan/blue/sky→**clay**, emerald/green/teal/indigo/purple/violet→**sage**,
  amber/yellow/orange→**ochre**, rose/red/pink→**brick**, slate→ciepłe neutralne (papier/len/inkaust). Zachowane
  struktury: `.glass-card`, `.text-gradient`, linki, scrollbar, białe-alpha ramki (poza rampą slate), `text-white`
  (okładki/przyciski). Ciemny motyw (bez `data-theme`/`="dark"`) na defaultach — bez zmian. Repaint dotyka
  wszystkich zakładek, ale weryfikowany pod „Kolekcję" (KPI/paski/oś czasu/dostępność/oficyny) wg `design/
  Main.dc.html`. Suite 463 zielone, lint czysty, build OK. NASTĘPNE (opcjonalnie): głębszy re-layout dashboardu
  „Kolekcja" 1:1 do makiety (rząd KPI + dwie kolumny) — większa zmiana, do potwierdzenia.
- **1.61.0** — **Pełny rebrand nazewnictwa UI: „Cogitator Omnissiah" → „Librem"** (ciepły, biblioteczny ton
  zamiast liturgicznego 40k). Wordmark `COGITATOR OMNISSIAH`→`LIBREM`, podtytuł→„Twoja kolekcja nagradzanej
  fantastyki". Zakładki: Statystyki Archiwum→**Kolekcja**, Katalog→**Katalog**, Liturgie
  Synchronizacji→**Synchronizacja**, Skaner Vinted→**Rynek**, Ustawienia→**Ustawienia** (Regał bez
  zmian). Zret-owane w całym UI: „Rytuał X"→nazwy opisowe (Porządkowanie tytułów, Oznaczanie cykli, Wydawcy,
  Serie, Nadawanie ISBN, Wykrywanie duplikatów…), Skaner Sanctity→**Kontrola spójności** ([ZATWIERDZONO]/
  [HEREZJA]→[SPÓJNE]/[NIESPÓJNE]), Duch Maszyny→**połączenia**, „archiwum"→**katalog/kolekcja**, skórka regału
  Relikwiarz→**Klasyczny**, ticker AVE·OMNISSIAH→LIBREM. `index.html` title/description/theme-color. **NIE
  ruszane** (dane): kolumny Notion (`AppConfig`, `Kategoria="Tom cyklu"`), TASK_REGISTRY, `awardName:"Wszystkie
  Nagrody"`, backendowe copy (`Przerwano Rytuał Wydania.` itp.). Zaktualizowane asercje w `App.test.tsx` +
  `CLAUDE.md` (konwencja brandingu). Suite 463 zielone, lint czysty, build OK. Ciemny motyw = wygląd 40k, ale
  copy jak wszędzie = Librem. NASTĘPNE: wizualne dopieszczenie zakładek do makiety Librem.
- **1.60.0** — **Przełącznik motywu: jasny „Librem" (boho) / ciemny „Warhammer" — DOMYŚLNIE JASNY.**
  Fundament pod pełny rebrand na Librem (makieta zaakceptowana). Silnik motywu: `data-theme` na `<html>`
  + `localStorage("librem-theme")`; inline-skrypt w `index.html` ustawia motyw przed montażem Reacta
  (bez FOUC), domyślnie `light`. Hook `src/hooks/useTheme.ts` (`{theme, toggle}`, SSR-safe). W `App.tsx`:
  przycisk Sun/Moon w headerze, `ParticleBackground` renderowany tylko w `dark`, gradient tytułu zależny
  od motywu. `src/index.css`: warstwa `:root[data-theme="light"]` — natywne style zostają ciemne
  (Warhammer, nietknięte), a jasny motyw remapuje najczęstsze klasy utility (slate/cyan/purple/amber/
  rose/emerald → paleta boho: paper/card/ink/muted/line/clay/sage/ochre/brick) + fonty Cormorant Garamond
  + Mulish. To FUNDAMENT (szeroki flip) — dopieszczanie per-zakładka do makiety i pełny rebrand nazewnictwa
  jeszcze przed nami. Suite 463 zielone, lint czysty, build OK.
- **1.59.0** — **Skaner ISBN obejmuje też książki bez nagród (tomy cykli).** Dotąd `toSearchIndex` był
  nagrodowo-only → skan nie znajdował tomów cykli (`Kategoria="Tom cyklu"`). Zmiany: (1) `toSearchIndex(books,
  awardOnly=true)` — Regał zostaje nagrodowo-only, ale nowy wariant „wszystko"; (2) `getBooks(fresh, all)` +
  `GET /api/books?all=1`; (3) `useBooks(all)` — **Katalog** (`SearchSection`) i skan używają `all=1`
  (award + tomy cykli), **Regał** (`BookshelfSection`) domyślnie nagrodowo-only; (4) `isbnEnrichService`
  przetwarza teraz KAŻDY wiersz z tytułem (usunięty filtr `isAwardBook`), więc tomy cykli też dostają ISBN.
  Efekt: skan tomu cyklu trafia; klasyczne szukanie w Katalog też pokazuje tomy cykli (spójne — „szukaj
  po wszystkim, co śledzę"); Regał i statystyki nagrodowe bez zmian. +2 testy (enrich tomu cyklu, indeks
  award-only vs all). UWAGA: po redeployie odpal ponownie „Rytuał Sygnatur (ISBN)", żeby dociągnąć ISBN-y
  do tomów cykli (więcej książek = więcej zapytań, rytuał ręczny — OK). (1) Na mobile
  (`matchMedia max-width:767px`) puste zapytanie NIE listuje pozycji — czysty ekran z podpowiedzią „zeskanuj
  lub wpisz tytuł" (`browseSuppressed`; browse-all pozostaje na desktopie); skan/wpis wypełnia widok. Licznik
  ukryty na czystym ekranie. Guard na brak `matchMedia`. (2) `ScanModal`: przycisk **latarki** (torch) —
  widoczny tylko gdy track kamery ma `getCapabilities().torch` (Android/Chrome); toggle przez
  `applyConstraints({advanced:[{torch}]})`, gaśnie przy `track.stop()`; reset stanu przy otwarciu. Obszar
  skanowania powiększony (modal `max-w-md`→`max-w-lg`, viewport `aspect-[4/5]` na mobile / `4/3` na sm+,
  ramka `inset-3`). Testy: suite 462 zielone (komponenty skanera bez zmian w logice testowanej).
- **1.57.0** — **Bughunt skanera/ISBN (3 agenty + weryfikacja) — 7 realnych fixów.** Rdzeń potwierdzony
  czysty (matematyka ISBN, cap, throw-logic, round-trip, brak utraty ISBN-ów). Naprawione: (1) FE — wyszukiwarka
  po ISBN robiła substring → rok „1984" trafiał w każdy ISBN zawierający „1984"; teraz match po PREFIKSIE
  (+ fragment ≥8 cyfr może w środku), koniec szumu. (2) FE — fetch skanu bez timeoutu mógł zawiesić spinner
  na wieczność → `fetchWithTimeout` (AbortController, 12 s) na obu fetchach. (3) FE — resolve ufał pustemu
  `book.title` (baner „null" + tryb przeglądania) → guard `book?.title`. (4) FE — `video.play()` reject
  zostawiał kamerę włączoną → `teardown()` w catch. (5) FE — ręczny wpis nie-ISBN zamykał się bez feedbacku
  → walidacja 10/13 cyfr + komunikat. (6) BE — błąd (429) na zapytaniu autor-owym w Google/BN ubijał całe
  źródło i pomijał fallback title-only → per-query try/catch. (7) BE — anulowanie w trakcie raportowane jako
  `complete` → post-loop check → status „Przerwano". (8) MAPPER — `notionMapper` NORMALIZUJE teraz każdy token
  ISBN na read (ISBN-10→13, odrzut junk „ISBN:") → brudna/legacy kolumna sama się leczy i skan trafia. +12
  testów. ODRZUCONE jako nie-bug/kosmetyka: quoting multi-word Google (precyzja vs recall — do „require author"
  w backlogu), `found` mislabel, X-strip w cleanScannedCode (spójne wewn.).
- **1.56.1** — **FIX: skaner też dopasowuje stary ISBN-10 (spójnie z wyszukiwarką).** Luka: `matchIsbnInIndex`
  (skan + ręczny wpis w oknie skanera) porównywał TYLKO do zapisanych ISBN-13, więc wpisany stary ISBN-10
  (`8370012256`) nie trafiał w wiersz zapisany jako `9788370012250` (antykwariat!). Fix: skaner dopasowuje
  teraz do `isbnSearch` (obie formy: 13 + odtworzone 10), dokładnie jak wyszukiwarka; fallback do `isbns`
  gdy brak `isbnSearch`. Match nadal DOKŁADNY (pełny numer, nie fragment) — cyfrowo, więc myślniki nieważne.
  +2 testy (stary ISBN-10 wpisany, z myślnikami, oraz e2e mapper→index→match).
- **1.56.0** — **Katalog: wyszukiwanie po ISBN (pełnym/częściowym) + stary ISBN-10.** Dotąd wyszukiwarka
  szukała tylko po tytule/oryginale/autorze — ISBN-ów NIE. Teraz `matchBooks` matchuje też ISBN: token
  numeryczny ≥4 cyfr (po odsianiu myślników) porównywany do blobu ISBN książki (substring → działa fragment).
  Blob (`BookIndexEntry.isbnSearch`, budowany w `toSearchIndex`) zawiera KAŻDY zapisany ISBN-13 ORAZ jego
  odtworzoną formę ISBN-10 (`isbn13to10` — dla prefiksu 978), więc STARE numery sprzed 2007 też trafiają
  (np. Slan: zapisany `9788370012250` → szukalny także jako `8370012256`). Spacje między formami blokują
  dopasowanie w poprzek dwóch ISBN-ów; próg 4 cyfr ucina szum („83"). +8 testów (round-trip 13↔10, pełny/
  częściowy/stary ISBN, próg, AND z tytułem). ODPOWIEDŹ na pytania: (1) tak, teraz szuka po części ISBN
  (w polu wyszukiwarki; skan nadal robi match DOKŁADNY po pełnym kodzie); (2) starych ISBN-ów NIE gubimy —
  `normalizeIsbn` konwertuje 10→13 przy zapisie, a polskie (978-83) są priorytetyzowane; forma 10 jest
  dodatkowo indeksowana do wyszukiwania.
- **1.55.0** — **ISBN pollution: polskie ISBN-y na początek + limit + auto-czyszczenie.** Realny bug: dla
  „451° Fahrenheita" enrichment zebrał 130+ obcych wydań → lista URWAŁA się na limicie 2000 zn. Notion,
  ucinając m.in. polski ISBN (skan by nie trafiał). Fix: `prioritizeIsbns(isbns, cap=40)` (`services/isbn.ts`)
  — dedup, polskie (prefiks `97883`) NA POCZĄTEK (przeżywają obcięcie + skan polskiego egzemplarza zawsze
  trafia), potem reszta, cap 40 (≈600 zn., bez ryzyka truncation). Enrichment stosuje to przy zapisie i
  porównuje ORDER-SENSITIVE (`isbnListsEqual`) → ponowny rytuał REWRITE'uje zapuchnięte rekordy (cap+reorder
  różni się od zapisanego → zapis; czyste bez zmian → `unchanged`). +5 testów (priorytet PL, dedup+cap,
  cleanup 60→40 PL-first, oba merge PL-first). NASTĘPNE (opcjonalnie): twardsze zawężenie u ŹRÓDŁA (wymóg
  autora / bez title-only dla krótkich tytułów), by w ogóle nie ściągać obcych wydań.
- **1.54.3** — **Skan: świeży fetch omija też cache SERWERA (`/api/books?fresh=1`).** Diagnostyka
  (`scan-debug`) potwierdziła: ISBN JEST zapisany, `kategoria=Nagroda`, `inScanIndex=true` → dane OK, problem
  = świeżość/klient. `getBooks()` używał 5-min `booksCache` (cache:true); ręczny wpis w Notion NIE unieważnia
  tego cache → apka podawała starą listę bez nowego ISBN. Poprzedni „świeży fetch" (1.54.1) omijał tylko cache
  PRZEGLĄDARKI. Teraz `getBooks(fresh)` + `/api/books?fresh=1` (cache:!fresh) — skan pobiera dane prosto z
  Notion. Jeśli mimo to pudłuje → stary bundle JS w apce (badge wersji `v{__APP_VERSION__}` w nagłówku pokaże;
  < 1.54.x = twardy refresh). ODNOTOWANE (osobny problem): enrichment nadmuchał „Miecz dla króla" do 72 ISBN
  (generyczny tytuł → title-only fallback zebrał masę niepowiązanych wydań) → ryzyko FAŁSZYWYCH trafień skanu
  innych książek; do zawężenia (wymóg autora / bez title-only dla krótkich tytułów / limit) — patrz Otwarte pozycje.
- **1.54.2** — **Diagnostyka skanu: `GET /api/scan-debug/:code`.** Skaner dalej „nie znajduje" mimo świeżego
  indeksu → endpoint do ustalenia PRZYCZYNY na żywo (Render). Read-only, bez cache: dla kodu zwraca
  `{ input, normalized, totalBooks, scanIndexSize, matchCount, matches: [{title, kategoria, isbns, inScanIndex}] }`
  — przeszukuje WSZYSTKIE książki (nie tylko nagrodowe), więc od razu widać: czy ISBN jest zapisany, na
  której pozycji, jaką ma `Kategoria` i czy jest w indeksie skanera (`inScanIndex`=false gdy „Tom cyklu").
  Hipotezy do rozstrzygnięcia: (a) książka to tom cyklu → poza indeksem; (b) zapisany ISBN różni się od
  skanowanego (checksum/format/inne wydanie); (c) stary bundle w cache przeglądarki. +1 test (routing).
- **1.54.1** — **FIX: skaner „nie znaleziono" mimo zapisanego ISBN (nieświeży indeks w apce).** Root cause:
  `useBooks` pobiera indeks TYLKO przy montowaniu; jeśli apka mobilna była otwarta PRZED rytuałem ISBN, jej
  lista w pamięci nie miała jeszcze ISBN-ów → `matchIsbnInIndex` szukał w nieświeżych danych → miss (potem
  wariant A/Google 429 → „nie znaleziono"). Test integracyjny (mapper→index→match) POTWIERDZIŁ, że logika
  dopasowania jest poprawna (w izolacji trafia), więc problem = dane, nie kod. Fix: przy skanie pobieramy
  ŚWIEŻY `/api/books` i dopasowujemy do niego (skan to rzadka, świadoma akcja — jeden refetch OK); świeża
  lista aktualizuje też stan (`setBooks` wystawione z `useBooks`). Komunikat miss doprecyzowany. +3 testy
  integracyjne (single ISBN, ISBN z listy, tom cyklu wykluczony z indeksu). UWAGA na przyszłość: wiersze
  `Kategoria="Tom cyklu"` są CELOWO poza indeksem Katalog → skan tomu cyklu nie trafi (osobna decyzja,
  gdyby trzeba skanować też tomy).
- **1.54.0** — **Rytuał ISBN: merge zamiast gap-fill + zapytanie po OBU tytułach.** Wcześniej rytuał
  POMIJAŁ pozycje, które miały już jakikolwiek ISBN (gap-fill) → książki uzupełnione samym angielskim
  ISBN-em nie dostawały polskiego. Teraz **każda** książka nagrodowa jest przetwarzana, a wynik SCALANY z
  istniejącą listą (`Set(existing) ∪ found`); zapis TYLKO gdy zbiór urósł (bez zbędnych zapisów — licznik
  `unchanged`). Kluczowe: lookup po OBU tytułach (polski + oryginalny), bo Biblioteka Narodowa indeksuje
  tytuł POLSKI („Diuna"), a Google/OL oryginalny („Dune") — dwa wywołania `lookupIsbnsByTitle` (każde =
  unia 3 źródeł), union wyników. Błąd per-książka tylko gdy WSZYSTKIE lookupy padły; istniejące ISBN-y nigdy
  nie giną. Wynik: `updated`/`unchanged`/`skipped`/`errors`. +4 testy (merge dokłada polski, unchanged bez
  zapisu, oba tytuły, all-fail→error). KOSZT: każdy przebieg odpytuje każdą książkę (do 2 tytułów × 3 źródła)
  — rytuał ręczny, akceptowalne.
- **1.53.0** — **Rytuał ISBN: polskie ISBN-y z Biblioteki Narodowej + unia 3 źródeł.** Skanujemy polskie
  egzemplarze (prefiks 978-83…), których Google/OpenLibrary często nie mają. Dodane 3. źródło:
  **Biblioteka Narodowa** (`data.bn.org.pl/api/institutions/bibs.json`, keyless) — autorytatywne dla polskich
  wydań; ISBN-y czytane z MARC 020 $a (po jednym na wydanie → wiele 020) + pole `isbnIssn`. Model zmieniony
  z „pierwsze źródło, które coś zwróci" na **UNIĘ 3 źródeł RÓWNOLEGLE** (`Promise.allSettled`: Google Books
  ∪ OpenLibrary ∪ BN) — więc łapiemy też polski ISBN, nawet gdy Google zwrócił oryginalny. Każde źródło z
  fallbackiem tytuł+autor→tytuł. Rzuca błąd TYLKO gdy WSZYSTKIE 3 padną (źródło z pustą odpowiedzią = sukces
  → „brak dopasowania"=skip, nie błąd). +5 testów (unia, BN z MARC/isbnIssn, throw-gdy-wszystkie-padną,
  częściowa awaria). Uwaga: BN/OL nieweryfikowalne w sandboxie (proxy blokuje) — potwierdzić na Renderze.
- **1.52.2** — **Rytuał ISBN: fallback OpenLibrary + WIDOCZNE błędy (dalej nic nie łapał po 1.52.1).** Po
  fixie kodowania (1.52.1) na Renderze dalej pusto — HIPOTEZA: Google Books ostro limituje keyless z IP
  datacenter (Render) → każde zapytanie 429/403 → wszystko leciało do BŁĘDÓW, a `SingleSyncSummary` błędów
  NIE pokazywał → wyglądało jak „0 znalezionych". Dwie zmiany: (1) **2 źródła** w `lookupIsbnsByTitle` —
  Google Books, a gdy pusto LUB nieosiągalne → **OpenLibrary** (`openlibrary.org/search.json`, keyless,
  tolerancyjne dla IP serwerowych; `doc.isbn` = ISBN-y wszystkich wydań). Union, dedup, ISBN-10→13. Rzuca
  wyjątek TYLKO gdy OBA źródła padną (prawdziwa awaria vs „brak dopasowania" = skip). (2) **Panel „Błędy —
  nie zapisano"** w `SingleSyncSummary` (czerwony, kopiowalny) — rytuał, który wywalił się na każdej książce,
  nie wygląda już jak „nic nie znalazł". +3 testy (OL fallback, throw-gdy-oba-padną, [] gdy brak dopasowania).
  Uwaga: nieweryfikowalne w sandboxie (proxy blokuje OL i limituje Google) — do potwierdzenia na Renderze;
  jak dalej pusto, panel błędów pokaże DOKŁADNĄ przyczynę (429/403/timeout).
- **1.52.1** — **FIX: rytuał ISBN nic nie znajdował (błędne kodowanie zapytania Google Books).** Root cause:
  `lookupIsbnsByTitle` łączył człony zapytania literalnym „+" (`intitle:X+inauthor:Y`), a axios koduje „+"
  jako `%2B` (literalny plus) → Google Books widział JEDEN śmieciowy token → 0 wyników dla KAŻDEJ książki
  (wszystkie leciały do „Pominięto"). Fix: łączenie SPACJĄ (`intitle:X inauthor:Y`) — axios koduje spację jako
  „+" (separator AND Google Books). Potwierdzone `axios.getUri` (spacja→`+`, `+`→`%2B`). Dodatkowo hardening:
  bierzemy TYLKO pierwszego autora z multi-value „Autor" (mniej przeograniczeń) + fallback na zapytanie
  title-only, gdy wersja z autorem nic nie zwróci. +2 testy (multi-autor, fallback) + asercja „q bez literalnego +".
- **1.52.0** — **Skaner ISBN: wiele wydań na pozycję (multi-edition) — koniec zastrzeżenia multi-edition.**
  Decyzja użytkownika: use case = „czy w ogóle mam tę książkę", nie „tę konkretną edycję" → zapisujemy
  WSZYSTKIE ISBN-y wydań, nie jeden best-match. `lookupIsbnByTitle`→`lookupIsbnsByTitle` (zbiera zdedupowane
  ISBN-13 ze WSZYSTKICH woluminów, `maxResults` 5→20, ISBN-10→13). `IsbnEnrichService` zapisuje listę
  (`isbns.join(", ")`) w kolumnie `ISBN`; gap-fill po pustej liście (idempotentnie). Mapper parsuje `ISBN`
  na `NotionBook.isbns: string[]` (split po `,`/`;`/spacji, dedup); indeks niesie `BookIndexEntry.isbns`.
  Frontend `matchIsbnInIndex` sprawdza przynależność skanu do listy (`isbns.some`) — barcode DOWOLNEGO
  wydania trafia w wiersz. Testy zaktualizowane (multi-edycja, dedup 10/13). Zastrzeżenie multi-edition
  z Otwartych pozycji ZDJĘTE.
- **1.51.0** — **Katalog: skaner kodów kreskowych — PR3 (mobilny skan UI, feature domknięty).**
  Przycisk skanu (ikona ScanBarcode) obok pola wyszukiwarki, widoczny TYLKO gdy natywny `BarcodeDetector`
  jest dostępny (`scanSupported()` — Android/Chrome). `ScanModal` (`src/components/search/ScanModal.tsx`):
  strumień tylnej kamery (`getUserMedia facingMode:environment`) → pętla `detector.detect(video)` po
  `ean_13`/`ean_8`/`upc_a`, pierwszy kod wyglądający na książkowy ISBN (`looksLikeBookIsbn`: 13 cyfr, prefix
  978/979) → callback; zawsze dostępny fallback ręcznego wpisania ISBN (brak kamery/uprawnień/API). Czysty
  helper `src/utils/barcode.ts` (`scanSupported`, `cleanScannedCode`, `looksLikeBookIsbn`, `matchIsbnInIndex`)
  + 6 testów. Logika w `SearchSection`: kod → dopasowanie WPROST po `entry.isbn` (wariant B) → ustaw zapytanie
  na tytuł + baner „Trafienie w archiwum"; brak → `GET /api/isbn/:code` (wariant A) → ustaw zapytanie na
  rozpoznany tytuł (fuzzy) + baner „Rozpoznano przez ISBN"; pudło → baner błędu. Sprzątanie strumienia przy
  zamknięciu/unmount. **Feature skanera kompletny (A+B).** ZASTRZEŻENIA nadal aktualne: iOS bez natywnego API
  (fallback ZXing odłożony), multi-edition ISBN (wariant A jako sieć).
- **1.50.0** — **Katalog: skaner kodów kreskowych — PR2 (kolumna ISBN + rytuał wzbogacania, wariant B).**
  Baza może teraz TRZYMAĆ ISBN, żeby skan dopasował wiersz wprost (bez zapytania zewnętrznego na skanie).
  Kolumna `ISBN` (rich_text) dodana do `requiredProps` (Rytuał Inicjacji Schematu). Nowy rytuał
  `IsbnEnrichService` (`isbn-enrich`): iteruje książki nagrodowe BEZ ISBN (idempotentny gap-fill), pyta
  Google Books po tytule (oryginalny→polski) + autorze (`lookupIsbnByTitle`: `intitle:`+`inauthor:`,
  wybiera 1. wolumin z ISBN-13, fallback ISBN-10→13 przez `normalizeIsbn`), zapisuje `ISBN` na wierszu
  (`updatePage` + `createColumnIfNeeded`); tomy cykli pominięte (`isAwardBook`). Mapper czyta `ISBN`→`isbn`
  (`NotionBook.isbn`), indeks wyszukiwarki niesie `isbn` (`BookIndexEntry.isbn`) → PR3 exact-match bez API.
  Wpięcie: TASK_REGISTRY `isbn-enrich`, controller `runIsbnEnrich`/`stopIsbnEnrich`, routy
  `/sync-isbn-enrich(+/stop)`, `useSyncManager` `isbnEnrichSync` + przycisk „Rytuał Sygnatur (ISBN)" (ikona
  Barcode) w OtherToolsCard. CELOWO poza „Wielkim Rytuałem" (pisze dane ze źródła zewnętrznego — uruchamiany
  świadomie, jak Żniwa/duplikaty). +8 testów (lookupByTitle, enrich orchestration, schema ISBN). ZASTRZEŻENIE
  multi-edition (patrz Otwarte pozycje): zapis JEDNEGO best-match ISBN ≠ egzemplarz fizyczny → wariant A
  (resolve→fuzzy) zostaje siecią. NASTĘPNE: PR3 (mobilny skan UI).
- **1.49.0** — **Katalog: skaner kodów kreskowych — PR1 (backend resolver ISBN, wariant A).** Fizyczny
  kod kreskowy = EAN-13 = ISBN-13, ale baza Notion NIE trzyma ISBN → kod nie dopasuje wiersza wprost;
  potrzebna rezolucja ISBN→tytuł, potem istniejąca rozmyta wyszukiwarka. Czyste helpery `services/isbn.ts`
  (`normalizeIsbn`: czyszczenie, walidacja sum kontrolnych ISBN-13/10, konwersja 10→13, odrzut nie-książkowych
  EAN prefix≠978/979). `services/isbnLookupService.ts` (`lookupIsbn`): Google Books `q=isbn:{isbn}` (bez
  klucza), mapowanie `items[0].volumeInfo`→`{isbn,title,author,year,source}`, cache w pamięci procesu.
  Wpięcie: `syncManager.lookupIsbn`, `GET /api/isbn/:code` (`getIsbn`: 400 zły ISBN / 404 brak / 200 hit,
  `normalizeIsbn` na wejściu). +11 testów. NASTĘPNE: PR2 (kolumna `ISBN` w Notion + rytuał wzbogacania po
  tytule+autorze → wariant B: skan dopasowuje wprost), PR3 (mobilny przycisk skanu w Katalog →
  `BarcodeDetector` → exact match po `isbn` (B) else resolve→fuzzy (A) + ręczny fallback ISBN). priming przez headless browser (Playwright).** `browserPrime.ts` —
  headless Chromium (`playwright-core`, optionalDependency, dynamic import) rozwiązuje wyzwanie JS Cloudflare
  po prawdziwe `cf_clearance` + UA, wpuszczane do `VintedSession` używanej dalej przez lekki axios. Knob
  `vinted.primeWithBrowser` (default off) + checkbox w Kalibracji, wpięte w skan i resolve sprzedawców.
  Best-effort: brak przeglądarki/błąd/brak clearance → fallback do lekkiego primingu. `esbuild --external:
  playwright-core`. +3 testy (mock playwright). NIE zwalidowane na żywo (proxy sandboxa blokuje CONNECT do
  Vinted) — do sprawdzenia lokalnie. Zastrzeżenie fingerprintu TLS/JA3 (patrz Otwarte pozycje pkt 2).
- **1.47.2** — **Audyt skanera Vinted: samonaprawa primingu w resolve sprzedawców + widoczność wznawialności.**
  (1) `resolveSellersToStore` primował sesję BEZ samonaprawy — jeśli rozgrzana sesja psuła wariant strony
  oferty, `extractVintedSeller` po cichu zawodził. Dodana sonda na 1. ofercie (jak w skanie): niezablokowana,
  ale bez sprzedawcy → porzuć sesję, ustalaj bez primingu. (2) Wznawialność: LOGIKA jest poprawna (planner
  oldest-first + skip-N-h testowany; `saveVintedData` invaliduje cache; `scannedAt` stemplowany przy match/
  pierwszym empty). Książki BLOKOWANE/BŁĘDNE świadomie NIE są stemplowane → wznowienie je ponawia; przy
  masowym bloku Cloudflare wygląda to jak „resume nie działa". Dodane liczniki `blocked`/`errors` w evencie
  `complete` + dopisek w podsumowaniu („Nie zeskanowano N…"), żeby było widać, że to blok, nie logika.
- **1.47.1** — **Priming Vinted: samonaprawa (nie może zaniżyć trafień).** Regresja: rozgrzana sesja
  (stały UA + Cookie) potrafi zmienić WARIANT strony serwowanej przez Vinted na taki bez inline'owanego
  katalogu → parser gubił WSZYSTKIE oferty (200 OK „dobry strzał", 0 książek). Fix: po primingu jedna
  sonda walidacyjna (URL katalogu 1. kandydata) — jeśli strona nie jest zablokowana ANI nie ma struktury
  katalogu (`data-component-name="Catalog"` / feed-grid / `/items/` / marker braku wyników) → sesja
  porzucona, skan leci bez primingu. Priming może pomóc na blok, nigdy nie zaszkodzić trafieniom. +1 test.
- **1.47.0** — **Skaner Vinted: priming ciasteczka Cloudflare (anty-blok, pkt 1 z listy alternatyw).**
  Przed skanem (i przed resolve sprzedawców) jedno GET strony głównej Vinted → przejęcie `Set-Cookie`
  (`cf_clearance` + sesja anon), niesione w `Cookie` na kolejnych żądaniach. **Stały UA na cały przebieg**
  (cf_clearance wiąże się z UA — rotacja by je unieważniła). Odporne: brak ciasteczek / błąd → pusta sesja,
  skan leci bez primingu (rotacja UA jak dotąd); priming pomijany przy zerze kandydatów. Nowy
  `services/vintedSession.ts` (`parseSetCookie` czysty + `primeVintedSession` + `cookieCount`),
  `vintedRequestHeaders(uaPool, session)` (stały UA + `Cookie`), knob `vinted.primeSession` (default on) +
  checkbox w panelu Kalibracji. +6 testów. Doc `vinted-scanner.md §3`. Następny fallback (jeśli mało):
  Playwright tylko do cookie (pkt 2).
- **1.46.0** — **Archiwum Cykli: sortowanie „Blisko końca" (najmniej do przeczytania) + przełącznik.**
  Domyślnie cykle sortowane po `total − read` rosnąco („szybkie zwycięstwa"), ukończone (przeczytane w
  całości) na dół. Przełącznik trybu w karcie (jak w paczkach Vinted): „Blisko końca" (easywins) vs
  „Najwięcej braków" (`missing` malejąco — dawne zachowanie). Czysty helper `src/utils/cycleSort.ts`
  (`sortCycles`, +4 testy); sort client-side (`useMemo`), backend `aggregateCycleRows` bez zmian.
- **1.45.2** — **„Odśwież Dane" pokrywa też Archiwum Cykli (audyt + fix).** Audyt: wszystkie karty
  statystyk czytają z `stats` (fetchStats), OPRÓCZ `CyclesHarvestCard` — miała własny `useCyclesHarvest`
  i przycisk „Odśwież Dane" jej NIE przeładowywał (jedyna luka; reszta modułów OK). Fix: `StatsSection`
  trzyma `refreshTick` — klik odświeża `fetchStats()` I inkrementuje sygnał; karta refetchuje na sygnał
  (guard pomija mount, silent = bez migania). Dodatkowo świeżość: `/api/cycles-harvest?fresh=1` omija
  5-min `booksCache` (`getCyclesHarvest(fresh)` → `{cache:!fresh}`), więc ręczny refresh jest tak świeży
  jak `/api/stats`. +2 testy (routing fresh flag). Uwaga: `useEffectiveConfig` (filie) świadomie poza
  refreshem — to konfiguracja, nie dane statystyk.
- **1.45.1** — **Podgląd cyklu: popover w miejscu kliknięcia (fix pozycjonowania) + etykieta „Cykl · N".**
  ROOT CAUSE: `CyclePanel` (`position: fixed`) renderowany WEWNĄTRZ transformowanych przodków
  (framer-motion `motion.div`) → fixed liczył się względem karty, nie viewportu (na długiej liście
  Vinted lądował „na środku", w Katalog ucinał pozycje). FIX: `createPortal(→ document.body)`
  + kotwiczenie w miejscu kliknięcia. Nowy czysty helper `src/utils/popoverPosition.ts`
  (`computePopoverPosition`: nad/pod wg wolnego miejsca, clamp do viewportu, `maxHeight` = dostępna
  przestrzeń → krótka lista się kurczy, długa scrolluje; +5 testów). Zamknięcie na scroll/resize/Esc/
  klik-poza. Kafelek pokazuje teraz „Cykl · N" (hardcoded „Cykl" + numer, bez tytułu; pełna nazwa w
  tooltipie + nagłówku panelu). Współdzielony `CycleTile`/`CyclePanel` → fix działa i w Vinted, i w
  Katalog. Doc `vinted-scanner.md` zaktualizowany.
- **1.45.0** — **Vinted: interaktywny kafelek cyklu + numer tomu (frontend, część 2/2 feature).**
  Współdzielony `CycleTile` (`src/components/CycleTile.tsx`): klik → `CyclePanel` (`useCycle`
  + `/api/cycle`), reużyty podgląd tomów ze Katalog; etykieta = nazwa cyklu + `· t.N` (z żniw),
  fallback „cykl". Wpięty w kafelki (`VintedBookResultList`) i wiersze paczek (`VintedBundleList`,
  wyjęty z `<a>` oferty → osobny link cena/koszyk). `cykl`/`cyklNr` przepuszczone przez
  `VintedResult`/`StoredBookPayload`/`storedToView`/`SellerBundleEntry`/`groupBySeller`.
  `BookResultCard` (Katalog) też zrefaktorowany na wspólny `CycleTile` (jedno źródło prawdy).
  +1 test (propagacja cyklu do paczek). Doc `vinted-scanner.md` zaktualizowany.
- **1.44.6** — **Vinted: propagacja cyklu przez pipeline (backend, część 1/2 feature).** `StoredBookView`
  + `toStoredBookView` niosą teraz `cykl`/`cyklNr` (obok `partOfCycle`/`year`); wynik `match` z żywego
  skanu też (`partOfCycle`/`cykl`/`cyklNr`) — więc `/api/vinted-stored` i skan na żywo mają nazwę cyklu
  i numer tomu prosto z wiersza Notion. +2 testy (`toStoredBookView`). Frontend (interaktywny kafelek
  + wyświetlenie tomu) w kolejnym PR.
- **1.44.5** — **Archiwum Cykli: rozdzielone luki + łagodniejszy znacznik tomu.** Nagłówek cyklu
  zamiast jednego chipa „X do zdobycia" (missing = ani posiadane, ani przeczytane) pokazuje dwie
  NIEZALEŻNE luki: zielony chip `<PackageOpen> X` (do zdobycia = nieposiadane, `total−owned`) i
  niebieski `<Book> X` (do przeczytania = nieprzeczytane, `total−read`). Per-tom znacznik „do
  zdobycia" zmieniony z ostrzegawczego `AlertTriangle` (amber) na łagodny `CircleDashed`
  (amber/70). Tylko UI (`CyclesHarvestCard`), backend bez zmian.
- **1.44.4** — **Fix: paski „Top Oficyny" pokazywały rozmiar zamiast read-rate.** `PublishingCard`
  rysował pasek oficyny jako `count/maxPub` (rozmiar względem największej), a etykieta mówiła
  `read/count` → największa oficyna (Mag) miała pełny pasek przy „26/82 przecz.". Pasek liczy teraz
  `read/count` (emerald przy komplecie), spójnie z sekcją Serie i własną etykietą. Usunięty martwy
  `maxPub`/`maxSer`. County zbierane poprawnie — błąd był tylko w proporcji paska (UI).
- **1.44.3** — **Rytuały Oficyny/Serie/Cykle pomijają poboczne tomy cykli.** `WikiFieldSyncService`
  (wydawca+seria) i `CyclesSyncService` iterowały `queryAllBooks()` bez filtra `isAwardBook` →
  wzbogacały/taggowały też wiersze `Kategoria="Tom cyklu"` (zbędne pobrania stron + zapisy na
  wierszach, których żaden konsument nagrodowy nie czyta). Filtr `rawBooks.filter(isAwardBook)` na
  wejściu obu rytuałów — spójne z modelem kategorii wierszy. +2 testy (pomijanie tomów).
- **1.44.2** — **Audyt integralności — remediacja kodu (front B).** Werdykt: kod jednolity (architektura
  wytrzymała), dryf głównie w DOKUMENTACJI (→ osobny PR). Fixy jednolitości: wspólny `encyclopediaUrl`
  (`src/utils/encyclopedia.ts`) zamiast 3 identycznych kopii (CyclePanel/CyclesHarvestCard/cycleRows;
  StatusSection = statyczne stałe, wiki.parser = inny wariant — zostają); `useShelfOrder` — `BookshelfSection`
  nie robi już surowego `fetch` (§2 Logic Isolation), transport w hooku, optymistyczny override zostaje w
  komponencie; testy `configService` (merge diff/defaulty/corrupt/cache/save-tylko-diff) + `cycleHarvestService`
  (create-missing/tag-existing/idempotencja/no-siblings). AKCEPTOWANE (nie-fix): `useMarkRead` (Regał) vs
  `useMarkAsRead` (Statystyki) — różne konteksty/efekty uboczne; duplikacja typów cross-boundary spójna z
  precedensem `statsService↔useStats`. NASTĘPNE: sync dokumentacji (guidelines v1.6 + CLAUDE.md + README + docs/).
- **1.44.1** — **Bughunt cykli (2 subagentów + weryfikacja) — naprawy.** Backend: (HIGH) bezimienne cykle
  (łańcuch prev/next bez `|cykl=`) zlewały się w jedną grupę „Cykl" i większość była pomijana w żniwach →
  `cycleName = |cykl= || tytuł pierwszego tomu` (stabilny między kotwicami); (DATA) żniwa używały `normKey`,
  a lookup `normTitle` → wiersz uznany za `inBase` mógł nie trafić w indeks żniw → duplikat; teraz wspólny
  `normTitle` (eksport z `cycleLookupService`); (DATA) wyścig get→await→set na `byTitle` → synchroniczna
  REZERWACJA slotu przed `addRow` (równoległe zadanie pomija); (MINOR) pomijanie pustych tytułów (brak
  junk-wiersza); (MINOR) sanityzacja nazwy cyklu RAZ (`cyc`) i użycie wszędzie → koniec thrash-write pola
  Cykl co przebieg. Frontend: (DATA) `persistStatsOrder` mógł nadpisać config DEFAULTAMI, gdy GET configu
  padł → guard `if (!cachedConfig) return`; `toggleSource` no-op na pustym id; błąd oznaczania → zwięzły
  baner nad listą (nie duży komunikat sugerujący brak danych). Test: bezimienny cykl nazwany 1. tomem.
  ZNANE OGRANICZENIE (nie-bug, chain-walk): `CyklNr` to pozycja W ODKRYTYM łańcuchu (MAX_HOPS/urwany
  neighbor/`{{Cykl}}` extras na końcu) — kolejność względna OK, numer bezwzględny może być przesunięty.
- **1.44.0** — **Rytuał Inicjacji Schematu: pełny provisioning (kolumny cykli + domknięcie długu).** Do
  `requiredProps` doszły: `Kategoria`(select), `Cykl`(rich_text), `CyklNr`(number) — dotąd tworzone leniwie
  przez Żniwa — oraz stary dług `Źródło`(multi_select), `VintedData`(rich_text), `ShelfOrder`(number) —
  dotąd tworzone leniwie przez skan/regał. Krok 1 „Wielkiego Rytuału" w pełni przygotowuje świeżą bazę,
  bez czekania na pierwsze użycie funkcji. Idempotentnie (tylko brakujące), `updateDatabaseProperty`
  obsługuje select/number/rich_text. Test rozszerzony o nowe kolumny. (AppConfig pominięty — zarządza nim
  config store przez opis kolumny.)
- **1.43.0** — **UC1: Vinted dla tomów cykli (dostępność w Archiwum).** Dzięki modelowi wierszy skaner
  Vinted JUŻ skanuje tomy cykli (są wierszami z pustym Źródło) i zapisuje `VintedData` — UC1 sprowadził
  się do WYŚWIETLENIA. `aggregateCycleRows` dokłada per-tom najtańszą ofertę (`vinted:{price,url,count}`,
  z `parseVintedData`, ceny > 0) oraz per-cykl `acquireCost` (suma najtańszych dla tomów „do zdobycia" z
  ofertą) + `acquirable`. Karta „Archiwum Cykli": pill „🛒 X zł" (link do najtańszej oferty) przy tomach
  nieposiadanych + badge „~X zł" w nagłówku cyklu (koszt skompletowania). Test agregacji ofert. To ORYGINALNY
  UC1 z backlogu, ale prostszy — brak „widm", bo tomy to realne wiersze (skaner bierze je za darmo).
- **1.42.0** — **Tomy cykli: „Tytuł polski" z linkiem do encyklopedii (jak oryginalne rytuały).** Wiersze
  tomów tworzonych żniwami mają teraz polski tytuł jako link do strony tomu w Encyklopedii — ten sam wzorzec
  URL co parser/karta (`cycleVolumeEncyclopediaUrl`: spacje→„_", encode). `buildCycleTitleProperty` (Tytuł
  polski + link z `isValidUrl`) używane przy tworzeniu; rytuał DOMIGRUJE istniejące wiersze (dokłada link
  gdy brak/inny — porównuje po `plTitleRichText[0].text.link.url`, bez zbędnych zapisów). Test kodowania URL.
- **1.41.0** — **Cykle jako wiersze — CV-PR3b (oznaczanie tomów w Archiwum).** Karta „Archiwum Cykli"
  ma teraz per-tom przełączniki **posiadane** (Posiadam) i **przeczytane** (Przeczytane) — klik dopisuje/
  usuwa znacznik Źródło na wierszu i odświeża widok (silent refetch, bez migania kartą; per-wiersz spinner
  `busyId`). Backend: „Posiadam" dodane do `ALLOWED_SOURCE_TAGS` (mark/unmark). `aggregateCycleRows` +
  `HarvestVolume` zwracają `id` wiersza. Hook `useCyclesHarvest` dostał `toggleSource(id, tag, active)`.
  Cache Notion inwalidowany przy zapisie → refetch pokazuje świeży status. Testy: „Posiadam" akceptowany,
  „Nagroda" odrzucany. Teraz oznaczasz tomy w apce, nie tylko w Notion. (CV-PR3b domknięty; zostaje
  ewentualne sprzątanie kolumny CycleCache.)
- **1.40.3** — **Rytuał Żniw: spójny opis + summary (audyt spięcia).** Opis przycisku był NIEAKTUALNY
  („cache, bez dopisywania do bazy") — po CV-PR2 rytuał tworzy wiersze; poprawiono na „Materializacja
  tomów cykli jako wiersze… oznaczalne i skanowane na Vinted". Summary: dodano listę `updated`
  (zaktualizowane/dopięte pozycje) obok `added`/`skipped` — parytet z innymi rytuałami (panele + liczniki
  w `SingleSyncSummary`). Reszta spięcia potwierdzona: endpointy `/api/sync-cycles-harvest(+/stop)`,
  instancja `useSync` (amber) w tablicy `syncs` (clearOthers/isAnySyncLoading), wynik pokazywany przez
  `SingleSyncSummary`. Celowo POZA „Wielkim Rytuałem" (pisze wiersze — uruchamiany świadomie, jak duplikaty).
- **1.40.2** — **Tomy cykli: etykieta Lp = „Nazwa (nr)".** Po teście użytkownika (tomy miały w Lp
  polski tytuł, niespójnie z numerami nagród): kolumna tytułowa `Lp` tomu cyklu = „Mistborn (3)"
  (`cycleLpLabel(cykl, nr)`; tytuł żyje w „Tytuł polski"). Stabilne, nie zależy od przenumerowań.
  Rytuał żniw MIGRUJE istniejące wiersze tomów do nowej etykiety (aktualizuje Lp gdy różne); kotwic
  nagrodowych (numer w Lp) NIE dotyka. Testy.
- **1.40.1** — **Audyt „cykle jako wiersze" + fix promocji.** Przegląd wszystkich konsumentów wierszy.
  FIX (korektność): `bookSyncService` — gdy rytuał nagród trafi na istniejący wiersz `Tom cyklu`
  (tom, który JEDNAK zdobył nagrodę), promuje go do `Kategoria=Nagroda` (inaczej zostałby ukryty w
  statystykach nagród; zapobiega też duplikatowi). Stała `AWARD_CATEGORY`. Audyt potwierdził poprawne
  filtry (staty/integralność/Regał/Katalog/duplikaty/Lp). ODNOTOWANE (nie-bug, decyzje na później):
  (a) brak w-appowego oznaczania tomów przeczytane/posiadane — Archiwum jest read-only, widoki nagród
  je wykluczają → oznaczasz w Notion; kandydat do CV-PR3b; (b) skan biblioteki i Vinted CELOWO obejmują
  tomy (Vinted zbiera dane pod UC1, ale nic ich jeszcze nie wyświetla); (c) cyclesSync/publisher/series/
  purify/wikiField iterują też tomy — nieszkodliwe wzbogacanie, dodatkowy ruch wiki.
- **1.40.0** — **Cykle jako wiersze — CV-PR3a (tomy poza numeracją Lp i duplikatami).** Na życzenie:
  poboczne tomy cykli NIE uczestniczą w globalnym numerze porządkowym — `lpSyncService` filtruje
  `isAwardBook` (numery nagród zostają czyste 1..N, tomy się nie wciskają; ich kolejność wewnątrz cyklu
  daje `CyklNr`). `duplicateSyncService` też filtruje `isAwardBook` (tomy cykli to odrębne książki, nie
  duplikaty). Testy. Uczciwa korekta: read-side (staty/integralność/Regał/Katalog) był już czysty
  (CV-PR1), ale rytuały PISZĄCE iterują wszystkie wiersze — Vinted CELOWO skanuje tomy; publisher/series/
  purify/biblioteka nieszkodliwie je wzbogacają. NASTĘPNE (CV-PR3b): opcjonalne włączanie cykli w Regale/
  Katalog, sprzątanie kolumny `CycleCache`.
- **1.39.0** — **Cykle jako wiersze — CV-PR2 (Żniwa tworzą wiersze, bloby wycofane).** Rytuał Żniw
  zamiast blobów robi **idempotentny upsert WIERSZY**: dla każdej kotwicy nagrodowej (`Część cyklu`)
  rozwija cykl (`CycleLookupService`) i dla brakujących tomów tworzy wiersz `Kategoria=Tom cyklu` +
  `Cykl`/`CyklNr` (`buildCycleVolumeProperties`, autor z kotwicy); istniejące pozycje (nagrodowe/utworzone)
  tylko dotagowuje polem `Cykl`/`CyklNr` (bez duplikatów; cykl rozwijany raz, dedup po nazwie i tytule).
  Archiwum czyta teraz WIERSZE: `aggregateCycleRows(books)` grupuje po `Cykl`, sort po `CyklNr`, „do
  zdobycia" = ani owned ani read; karta status tomu = przeczytana/posiadana/do zdobycia. Mapper czyta
  `Cykl`/`CyklNr` (usunięto `cycleCache`). USUNIĘTE: blob `CycleCache` — `saveCycleCache`, `cycleHarvest.ts`
  (build/parse/merge) + test. Nowe kolumny auto-tworzone: `Kategoria`(select), `Cykl`(text), `CyklNr`(number).
  Tomy są teraz oznaczalne (przeczytane/posiadane) i skanowane przez Vinted. NASTĘPNE: CV-PR3 (opcjonalne
  włączanie cykli w Regale/Katalog, duplikaty, szlify).
- **1.38.0** — **Cykle jako wiersze — decyzja + CV-PR1 (infrastruktura separacji `Kategoria`).**
  DECYZJA użytkownika: poboczne tomy cykli będą REALNYMI wierszami bazy (opcja A: te same wiersze +
  `Kategoria`), żeby dało się je oznaczać przeczytane/posiadane i żeby Vinted je skanował. Gap w blobach:
  tom „nieprzeczytany" = brak wiersza, nie dało się oznaczyć. CV-PR1 (bezpieczny fundament, no-op dopóki
  nie ma takich wierszy): mapper czyta `Kategoria` (select; pusto = „Nagroda"), `NotionBook.kategoria`,
  helper `isAwardBook`/`isCycleVolume` (`services/bookCategory.ts`). Filtr `isAwardBook` w choke-pointach
  nagrodowych: `statsService.getStats` (1 linia → wszystkie staty), `integrityService` (rok/Lp vs wiki),
  `toSearchIndex` (Regał + Katalog). Vinted CELOWO bez filtra (ma skanować też tomy cykli). Testy.
  NASTĘPNE: CV-PR2 (Żniwa robią idempotentny upsert wierszy `Kategoria=Tom cyklu` zamiast blobów; Archiwum
  czyta wiersze), CV-PR3 (opcjonalne włączanie cykli w Regale/Katalog, sprzątanie blobów, duplikaty).
- **1.37.1** — **Żniwa Cykli: poprawki po testach.** (1) Podsumowanie liczyło „1" — bo `summary.updated`
  było jednym zdaniem, a UI liczy count z długości listy; teraz `result.updated = liczba zapisanych`
  + `summary.updated` to RZECZYWISTA lista tytułów (skipped = tytuły bez sąsiednich tomów; pusty 0-case
  bez summary → widok „Rytuał Zakończony"). (2) „Archiwum Cykli": cykle przeczytane w całości
  (`read === total`) są wygaszone (opacity-45) + badge „Ukończony" (cyan), bright tylko gdy rozwinięte.
- **1.37.0** — **Cykle: karta „Archiwum Cykli" (UC2) — Etap 1 frontend (CYH-PR2).** Czysty
  `mergeCycleCaches(books)` scala bloby `CycleCache` z wszystkich pozycji w listę cykli (grupa po
  nazwie, dedup tomów po tytule, statusy OR-owane, sort malejąco po `missing`) → `getCyclesHarvest()`
  + `GET /api/cycles-harvest`. Front: `useCyclesHarvest` + `CyclesHarvestCard` (rozwijane cykle,
  liczniki inBase/total + badge „N do zdobycia", statusy tomów jak Katalog, link do Encyklopedii,
  ikona nagrody) wpięta jako karta „cyclesHarvest" w Analizie Zasobów. Testy agregacji. Zweryfikowane
  zrzutem. (Później model zmieniony: tomy cykli = REALNE WIERSZE, bloby `CycleCache`/„widma" porzucone — zob. Otwarte pozycje.)
- **1.36.0** — **Cykle: Rytuał Żniw (harvest struktury do blobu per-pozycja) — Etap 1 backend (CYH-PR1).**
  Nowy rytuał `cycles-harvest` (`CycleHarvestService`): iteruje książki z „Część cyklu", reużywa
  `CycleLookupService` (prev/next + {{Cykl}} + cross-ref) i zapisuje zebrane tomy w blobie `CycleCache`
  na TEJ pozycji (rich_text, segmenty ≤2000 jak `VintedData`, `saveCycleCache`). To CACHE, NIE nowe
  wiersze bazy (świadomie). Skip-if-unchanged (`sameCycleContent` ignoruje ts) → mniej zapisów; uczciwy
  raport (written/unchanged/noSiblings/errors). Czyste helpery `services/cycleHarvest.ts`
  (build/serialize/parse/sameContent) + testy. Wpięcie: TASK_REGISTRY `cycles-harvest`, controller
  `runCyclesHarvest`/`stopCyclesHarvest`, routy `/sync-cycles-harvest(+/stop)`, `useSyncManager`
  `cyclesHarvestSync` + przycisk „Rytuał Żniw Cykli" w OtherToolsCard. Mapper czyta `CycleCache`→`cycleCache`.
  Decyzja architektoniczna: blob per-pozycja (nie zbiorczy — limit Notion, sentinel-row odpada);
  dedykowany rytuał (nie doczepka do skanu Vinted — rozdział struktura vs dostępność).
  (Później: blob `CycleCache` zastąpiony REALNYMI WIERSZAMI `Kategoria="Tom cyklu"` — bloby/widma porzucone.)
- **1.35.2** — **Statystyki: masonry „wiersz po wierszu" (round-robin).** CSS `columns` czytało
  się kolumnami (cała lewa, potem prawa) — nieintuicyjne przy drag&drop kolejności. Teraz karty
  rozkładane round-robin `distributeColumns(items, cols)` (i % cols) do osobnych kolumn flex:
  0,2,4 w lewej, 1,3,5 w prawej → odczyt lewo→prawo pozostaje 0,1,2,3,..., a kolumny pakują się
  niezależnie (bez dziur). `cols` z `matchMedia('(min-width:768px)')` (1/2). Karty pełnej szerokości
  (span2) przerywają blok i renderują się na całą szerokość (segmentacja `full`/`block`). Helper
  `renderCard` (DRY DnD). Test round-robin. Zastąpiło `columns`/`column-span:all` z 1.35.1.
- **1.35.1** — **Statystyki: masonry zamiast siatki (koniec dziur od wysokości pary).**
  Kontener `columns-1 md:columns-2` + karty `break-inside-avoid mb-8` — każda kolumna pakuje się
  niezależnie, więc krótsza karta nie rozciąga się do wysokości wyższego sąsiada i nie zostawia
  pustego miejsca ani nie przesuwa kafelka niżej. Karta pełnej szerokości (histogram dekad) rozpina
  się przez `md:[column-span:all]`. Usunięto `h-full`/`items-stretch` (equal-height już zbędne).
- **1.35.0** — **Statystyki: drag&drop kolejności kart.** Nagłówek „Analizy Zasobów" ma przełącznik
  trybu układania (ikona `LayoutGrid` → `Check`) + reset (`RotateCcw`). W trybie: karty `draggable`
  (native HTML5 DnD), inner `pointer-events-none`, dashed amber ring, badge „przeciągnij", drop-target
  podświetlony cyan. Kolejność = lista id sekcji w `ui.statsOrder` (nowy knob, default `[]` = kolejność
  z kodu); zapis optymistyczny przez `persistStatsOrder` (PUT /api/app-config, nie klobruje innych
  knobów). Czyste helpery `orderByIds`/`moveId` w `utils/statsLayout.ts` (nowe karty dopisywane na końcu,
  martwe id ignorowane) + testy. Karty dostały `id` + `h-full`; grid `items-stretch`.
- **1.34.1** — **Podgląd cyklu: linki do Encyklopedii.** Każdy tom w `CyclePanel` ma ikonę
  „otwórz w Encyklopedii" (nowa karta) — URL `index.php?title=<tytuł z _>` (wzorzec jak w parserze),
  `stopPropagation` by nie zamykać modala. Wygodny podgląd tomu bez ręcznego szukania.
- **1.34.0** — **Podgląd cyklu — Katalog (CYC-PR2).** Badge „cykl" w `BookResultCard` jest
  teraz KLIKALNY → modal `CyclePanel`. `useCycle` (GET /api/cycle, cache per title+author w ref).
  Panel: nazwa cyklu, ostrzeżenie „przed tą pozycją N nieprzeczytanych tomów — nadrób dla fabuły"
  (unreadBefore), uporządkowana lista tomów ze statusem (przeczytana/posiadana/w bazie/brak +
  ikona nagrody), wyróżniony bieżący (pin), adnotacja „nie zapisujemy w bazie". Esc/klik-tło zamyka.
  Rozwiązuje przypadek „nagrodzony jest tom 2 — którego tomu 1 nie mam/nie przeczytałem".
- **1.33.0** — **Podgląd cyklu — backend (CYC-PR1).** Na żądanie, BEZ zapisu do Notion (zgodnie z
  preferencją: nie zaśmiecamy bazy). `WikiParser.extractCycleInfo` (nazwa `|cykl=`, łańcuch
  `|poprzednia=`/`|następna=` — potwierdzony format; oba warianty ogonka „następna/nastepna"; +
  oportunistyczne linki z `{{Cykl}}`). `services/cycleLookupService.ts`: rozwiązuje stronę książki
  (direct+search+bramka autora), chodzi po łańcuchu prev/next (bounded MAX_HOPS=15, visited-set),
  dołącza linki `{{Cykl}}`, krzyżuje każdy tom z bazą (inBase/read/owned/awarded), liczy `unreadBefore`
  (ile tomów przed bieżącym nieprzeczytanych = koszt wejścia w fabułę). Cache w pamięci procesu
  (title+author). `GET /api/cycle?title&author` (404 = brak cyklu). Testy +8 → 347. UWAGA: host
  encyklopedii zablokowany przez proxy dev-kontenera (403) — format `{{Cykl}}` nieweryfikowalny lokalnie,
  dlatego RDZEŃ = pewny łańcuch prev/next; działanie na żywo potwierdzić po deployu.
- **1.32.0** — **Statystyki: panel „Rynek" (STAT-PR4, ostatnia z 4 kart).** Czysty helper
  `services/marketStats.ts` (`computeMarketStats`) z blobu `VintedData`: koszt skompletowania
  (suma najtańszych ofert po jednej na CHCIANĄ książkę — nieprzeczytana i nieposiadana),
  najtańsze okazje (top 8), świeże spadki cen (cena < prevPrice, największe pierwsze),
  ranking sprzedawców z paczką (≥2 chcianych książek, suma min-per-book). Waluta = dominująca
  w ofertach. Karta `MarketCard` (actionable — linki wprost do ofert/profili). Reuse
  `parseVintedData`. Testy +5 (osobny plik) → 339. **KOMPLET 4 kart statystyk** (Rynek /
  Wydawnictwa-Serie-Cykle / Dekady / Dostępność) — wszystkie z danych, które już mamy.
- **1.31.0** — **Statystyki: Oś czasu / dekady (STAT-PR3).** `decadeStats` w `getStats` — rollup
  roczników do dekad (pierwszy 4-cyfrowy rok; wielodatowe → pierwszy; brak roku pominięty),
  total/read/owned per dekada. Karta `DecadeHistogram` (pełna szerokość, `md:col-span-2`):
  pionowe słupki total z cyanowym wypełnieniem = przeczytane, złoty highlight „złotej ery"
  (najliczniejsza dekada), legenda + łączny licznik przeczytań. GOTCHA: kolumny słupków
  wymagają `h-full` (row `items-end` nie rozciąga wysokości → słupki 0px). Testy +1 → 334.
- **1.30.0** — **Statystyki: Wydawnictwa / Serie / Cykle (STAT-PR2).** Nowe bloki w `getStats`
  z pól, które wypełniają rytuały publisher/series/cycles, a statystyki dotąd ignorowały:
  `publisherStats` (top 15 oficyn: liczba tytułów + read-rate), `seriesStats` (top 15 serii:
  posiadane/total → luki), `cycleStats` (udział „część cyklu" w kolekcji). Karta `PublishingCard`
  (pasek cykli + top oficyny z read-rate + serie z „luki/komplet", zielony = komplet). Testy +1 → 333.
- **1.29.0** — **Statystyki: zagregowana dostępność + dług libraryStats (STAT-PR1).** `StatsService`
  dostaje `ConfigService`. `libraryStats` iteruje teraz `config.library.branches` (koniec hardcode
  Felin/Bronowice — 3. filia z Kalibracji od razu w statystykach; `id` = `sourceTag`, zachowana
  zgodność z `addBookToLibrarySection`). Nowy `availabilityStats`: partycja priorytetowa
  nieprzeczytanych (posiadane > biblioteka(tag filii) > Vinted(≥1 oferta z blobu) > brak śladu),
  każda książka liczona raz → sumuje do `totalUnread`. Karta `AvailabilityCard` (stacked bar +
  legenda %/liczby) w StatsSection. Reuse `parseVintedData`. Testy +2 → 332. Pierwsza z 4 kart
  statystyk (Rynek / Wydawnictwa-Serie-Cykle / Dekady / Dostępność).
- **1.28.0** — **Precyzyjny drag&drop na regale (DND-PR2).** Sort półek: `byShelfPosition`
  (dekada → `effShelfKey` → tytuł); `effShelfKey` = `shelfOrder` o ile mieści się w dekadzie książki
  (klucz STALE spoza dekady ignorowany → powrót do roku). Czysty planer `shelfInsertion.ts`:
  `canInsertAt` (walidacja: szczelina musi sąsiadować z dekadą książki; „bez daty" wykluczone) +
  `planInsertion` (klucz-środek między sąsiadami = 1 zapis; remis rocznika → renumeracja TYLKO
  związanego przedziału, limit 40). UI: `ShelfRow` liczy granice szczelin (kupka = 1 slot) i rysuje
  neonowy kursor wstawienia (cyan = OK, róż = zła dekada); `Shelf` mapuje granice na cel
  (`beforeId`/koniec półki, no-op przy sobie samej) i waliduje; `BookshelfSection.handlePreciseDrop`
  = optymistyczne `orderOverrides` + POST `/api/shelf-order` z rollbackiem + (przy zmianie półki)
  standardowa zmiana „przeczytane" (wydzielone `applyReadChange`). Globalny drop na ramę bez zmian;
  szczelina ma priorytet (stopPropagation tylko przy walidnym trafieniu). Knob `ui.preciseShelfDrop`
  (default on, sekcja Zaawansowane). Testy: +10 (planer/sort/walidacja) → 330. Screeny: caret OK/odmowa. Kolumna `ShelfOrder`
  (number, tworzona przy pierwszym zapisie): rzadki, ręczny klucz porządku w skali ułamkowych lat —
  utrwalamy TYLKO ręcznie wstawione książki, reszta zostaje na deterministycznym auto-układzie
  (rok → dekada → fizyka). Mapper/typy (`NotionBook.shelfOrder`, `BookIndexEntry.shelfOrder`),
  indeks wyszukiwarki, adapter `setShelfOrders` (sekwencyjnie, partie małe), `POST /api/shelf-order`
  (limit 40 wpisów, walidacja). Bez zmiany zachowania — sort i UI dropu w następnym PR.
- **1.27.0** — **Zakładka „Ustawienia" (frontend, CFG-PR2).** Klik w LOGO (nagłówek)
  otwiera ukrytą zakładkę `admin` (ponowny klik wraca do statystyk; logo amber gdy aktywna).
  `ConfigSection`: sekcje Vinted / pula UA / filie OPAC (edytor wierszy) / strony nagród (edytor)
  / Zaawansowane (zwijane: timeout/retry, równoległości, progi duplikatów, rzędy regału, wykluczenia
  biblioteki). Zapisz → PUT `/api/app-config`; „Domyślne" resetuje draft. `useAppConfig` (panel,
  świeży GET) + `useEffectiveConfig` (konsumenci: cache modułowy, defaulty do czasu pobrania,
  publish po zapisie). Konsumenci cfg: dropdown nagród (useSyncManager.awardOptions → SyncAwards),
  filie w StatsSection, `pageSize` regału, `resumeHours` Vinted (checkbox + tooltip via prop).
  `constants.ts` = fallbacki derywowane z DEFAULT_CONFIG (+`SYNC_ALL_AWARD`). UWAGA JSX: polskie
  cudzysłowy „" w atrybutach stringowych psują parser — używać `{'...'}`.
- **1.26.0** — **Konfiguracja aplikacji (backend, CFG-PR1).** Nowy współdzielony schemat
  `src/configSchema.ts` (AppConfig + DEFAULT_CONFIG + mergeConfig z clampami + diffFromDefaults +
  parseStoredConfig; defaulty = dotychczasowe zachowanie 1:1). **Składowanie: diff od defaultów
  jako JSON w OPISIE kolumny `AppConfig`** (adapter `get/saveAppConfigRaw`; opis, nie wiersz —
  sentinel wyciekałby do rytuałów iterujących wiersze). `services/configService.ts` (cache 30 s,
  limit blobu 1900 zn., odporny odczyt → defaulty). REST: `GET/PUT /api/app-config`. Konsumenci:
  vinted (URL katalogu/timeout/retry/throttle/UA/wykluczenia/cap sprzedawców), library (concurrency/
  wykluczenia/UA), bookSync+syncManager-diagnostyka (nagrody z cfg — skasowane 2 z 3 kopii listy),
  duplicates (progi 0.85/0.9), bookSync+cycles (writeConcurrency). Testy: +7 (configSchema) → 320.
  Uwaga: listy wykluczeń Vinted i biblioteki celowo OSOBNE (różnią się Audioteką).
- **1.25.3** — **Vinted „Kontynuuj": okno 12 h → 24 h.** Audyt potwierdził, że mechanizm wznowienia
  jest nienaruszony (bloki celowo nie zapisują `scannedAt`, stąd pozorne „189 co przebieg" w czasie
  fali wykryć). Przy skanach raz dziennie 12 h zawsze wygasało — teraz `RESUME_HOURS = 24`,
  zdeduplikowane do JEDNEGO eksportu w `VintedScanControls.tsx` (import w `VintedCheckItem`;
  wcześniej stała była zdublowana w dwóch plikach i mogła się rozjechać).
- **1.25.2** — **Skanery: odświeżona pula User-Agentów (sierpień 2026).** Audyt regresji po
  refaktorze god-object/god-hook wykazał, że CAŁA konfiguracja skanera Vinted (URL, nagłówki,
  agent, timeout 30 s, retry 3×4 s bez ponawiania 403, throttle 3–5 s, `looksBlocked`, watchdog
  120 s) przetrwała bajt w bajt — bloki to eskalacja po stronie Vinted/Cloudflare, nie nasz kod.
  Pierwszy krok mitygacji: pula UA z Chrome 120–122/FF 122 (początek 2024) → **Chrome 151/152,
  Firefox 154, Edge 151, Safari 26.0** (formaty realne: Chrome x.0.0.0 zredukowane, Safari
  zamrożone Version/26.0, tokeny platform zamrożone). Też hardcoded UA w `wiki.adapter.ts`.
  UWAGA: odświeżać pulę co kilka miesięcy. Jeśli bloki nie ustąpią → dłuższy throttle / proxy
  rezydencjalne (Cloudflare Worker NIE jest rezydencjalny — datacenter IP, nie zdejmie scoringu).
- **1.25.1** — **Przekładki: tabliczki zawsze nad deseczkami + przytłumiony amber.** (1) Render dwuwarstwowy
  w `ShelfRow`: najpierw wszystkie deseczki (`ShelfDivider part="board"`, z-20), potem wszystkie tabliczki
  (`part="plate"`, z-40) — tabliczka nie chowa się już pod deseczką sąsiada (ani własną). `ShelfDivider`
  dostał prop `part`. (2) Amber dividera przygaszony: deseczka `#cda24c→#b07d2e→#6b3d12` (było `#fcd34d→#f59e0b`),
  `--noo-glow` przekładki `214,168,92` zamiast pełnego `--sk-frame-accent`, tabliczka/sygil w łagodniejszym tonie.
- **1.25.0** — **Przekładki dekad: krawędź półki, amber w Holo+, plakietki na deskę, sygil u dołu.**
  (1) **Granica półki**: `assignDividerLevels` → `assignDividerPlacement(row, labelOf, rowWidth)` — zwraca
  `{level, dir}`; gdy tabliczka wyszłaby poza prawą krawędź (`x + plateWidth > rowWidth`), rozwija się
  **w lewo** (`dir="left"`, prawy brzeg przy deseczce). `ShelfRow` dostaje `rowWidth` z `Shelf` (well).
  (2) **Amber w Holo+**: reguła `.skin-holo .shelf-divider` nadpisuje lokalnie `--noo-glow`→`--sk-frame-accent`
  + deseczkę/tabliczkę/sygil na amber (spójnie z oprawą Regału); Relikwiarz bez zmian (teal/mosiądz).
  (3) **Dolne plakietki na linii półki**: `bottom:-12` — nachodzą na deskę, przestały zasłaniać tytuły;
  z-index przekładki 15→**30** (plakietki zawsze nad grzbietami i deską). (4) **Sygil u dołu** każdej
  przekładki (drugi `CogSigil` na linii półki). Czysto render; fizyka/pakowanie bez zmian. Testy: +2 → 313.
- **1.24.0** — **Tabliczki dekad: auto-unik kolizji (góra↔dół).** Wąska dekada (mało książek →
  następna przekładka blisko) powodowała, że pozioma tabliczka rocznika nachodziła na sąsiednią.
  Nowy pure-helper `assignDividerLevels` (w `shelfLayout`) liczy per-rząd, zachłannie od lewej,
  które tabliczki muszą zjechać na dół: `plateWidth(label)` estymuje szerokość napisu; jeśli
  górna kolidowałaby z poprzednią górną → `plate="bottom"`. `ShelfDivider` dostał prop `plate`
  (dolna tabliczka + smużka światła w górę). Czysto wizualne, fizyka/pakowanie bez zmian. Testy
  (`plateWidth`, kolizje, łańcuch, sort/ignore) — +5 → 311.
- **1.23.4** — **Audyt kolorów #4: kontrast (WCAG).** Treść czytelna `slate-600`→**`slate-400`**
  (empty-state'y: „Baza pusta", „Brak szczegółów", „Archiwum milczy…", „Brak unikalnych rekordów" ×2,
  podpowiedź resetu w OtherToolsCard). Metadane (rok/seria w `BookResultCard`) `slate-600`→**`slate-500`**.
  Placeholdery `placeholder-slate-700` (SchemaColumnCard) / `-600` (SearchSection) →**`-500`** (były
  1.9:1, FAIL). Stopka Regału i licznik „/ N" `amber-200/40`→**`/60`**. Tekst błędu/ostrzeżenia bez
  alfy: `text-red-400/80`→`red-400`, `text-red-500/60`→`red-400` (App.tsx). Separator „," w
  podpowiedziach Search `slate-600`→`slate-500` (spójnie z „?"). **Zostawione** dekoracyjne ikony
  (`Circle`/`ChevronRight`/`ChevronDown`/`XCircle`/`BookImage` na `slate-600`). Domyka wdrożenie audytu
  kolorów (PR #1–#4).
- **1.23.3** — **Audyt kolorów #3: abstrakcje + martwy kod.** `OtherToolsCard` — 7 ręcznie klepanych
  przycisków (w 2 różnych idiomach) → `RitualButton` sterowany tablicą `rituals` (jeden idiom, centralny
  `ritualButtonTheme`). `YearlyProgressItem` — inline `from-orange-500 to-red-600` → `getRitualGradient("orange")`.
  `ritualGradient` dopełniony do **8 kluczy** (dodane rose/indigo/blue/amber) — koniec cichego fallbacku na
  zielono dla tych rytuałów; `Record<RitualColor,…>`. Usunięty martwy wpis `amber` w `ShelfFrame.ACCENT`
  (+ zwężony typ `ShelfAccent`).
- **1.23.2** — **Audyt kolorów #2: ujednolicenie znaczeń.** (1) **danger = red** wszędzie: rose→red w
  IntegrityCheckCard / SchemaColumnCard (krytyczny limit + usuwanie) / ConfirmDialog (destrukcja) /
  SchemaEditor (banner błędu); rose zostaje **wyłącznie** marką Vinted + rytuałem „Wydawcy". (2) **jedno
  pojęcie = jeden kolor**: „biblioteka" tag w Search indigo→blue (jak statystyki Biblioteki); kropka „OK"
  w StatusSection cyan→emerald (sukces=emerald). (3) **kolory-sieroty**: teal→indigo (VintedResolveStatus,
  kontekst „dane z bazy"), green→emerald (IdentifiedLibraryItem exact-match), violet→purple (nominacja),
  sky-400→cyan-400 w liniach ParticleBackground.
- **1.23.1** — **Oprawa Regału = amber (kolor zakładki), spójnie z konwencją „kolor per zakładka".**
  Nowy token `--sk-frame-accent` (Holo+ amber `251,191,36`; Relikwiarz teal — bez zmian) steruje ramką
  (`--sk-frame-border/-glow`), narożnikami HUD (`HudCorner` — lokalnie nadpisuje `--noo-glow`, by puls też
  był amber) i listwą gzymsu. Wnętrze (godło/deseczki/ticker/sygnatury/szkło książek) zostaje na `--noo-glow`
  (cyan). „Mosiężna oprawa relikwiarza trzymająca cyanowe data-tomy". Zaczyna wdrożenie audytu kolorów.
- **1.23.0** — **Grzbiety zależne od skóry (wariant „E").** Holo+: grzbiet = **szkło w akcencie
  aplikacji** (paleta `APP_PALETTE` cyan/niebieski/indygo/fiolet/purpura, równoległa do `CLOTH_PALETTE`
  po tym samym indeksie) + **neonowa lewa krawędź** + **biały tytuł z glow**; kupki i okładki
  „Wyróżnione" też przemalowane (fore-edge cyan, gwiazdka cyan). Relikwiarz: matowe grzbiety bez zmian.
  `spineStyle` zwraca dodatkowo `app`/`appRgb`; element podaje akcenty inline (`--spine-muted`/`--spine-app`/
  `--spine-app-rgb`/`--cm-*`/`--ca-*`), a wygląd nadają **realne reguły** `.skin-* .book-spine/.spine-title/
  .stack-layer/.fore-edge/.cover-*` w `index.css` (gradient w custom-property z zagnieżdżonym `var()` bywa
  zjadany przez pipeline CSS — stąd klasy zamiast `var(--sk-...)`). Fizyka/szerokości bez zmian. +2 asercje.
- **1.22.3** — Sprzątanie ozdób regału: usunięte **pieczęcie czystości** (+ sygnatura IX-774) z ram
  i **proporzec** z tła (`RoomDecor`). Brązowa obwódka korpusu → tokeny `--sk-frame-border` /
  `--sk-frame-glow`: w Holo+ **glow cyan**, w Relikwiarzu brąz. Listwa świetlna gzymsu też w kolorze
  poświaty skóry. Usunięty martwy `PuritySeal` + nieużywane `--sk-seal-wax` / `--sk-room-pennant` /
  `--sk-room-cog2`.
- **1.22.2** — **Holo+ dostrojony do palety aplikacji.** Korpus/wnęka/cokół = slate-900→slate-950
  (jak karty i tło `bg-slate-950`), sala `RoomDecor` zlewa się z tłem strony; akcenty cyan-400
  (`#22d3ee`) + purpura-500 (`#a855f7`, pieczęć/aureola/proporzec) — spójne z gradientem nagłówka
  cyan→blue→purpura. Award color-code (Hugo=złoty itd.) bez zmian (to dane, nie motyw). Relikwiarz
  zostaje ciepłym mosiądzem jako alternatywa. Zweryfikowane realnym renderem na tle `bg-slate-950`.
- **1.22.1** — **Skóra obejmuje też Salę Archiwum (`RoomDecor`).** Tło pokoju (ściana, podłoga,
  znak wodny koła, proporzec, kurz, płomień + poświata kinkietów) czyta `--sk-room-*` — Holo+ dostaje
  chłodną salę cyan/adamant, Relikwiarz zostaje ciepły mosiądz. `CogMark` maluje kolor przez `style`
  (atrybut `fill` nie rozwiązuje `var()`). Nowe tokeny `--sk-room-{bg,inset,floor,cog,cog2,pennant,mote,glow,flame}`.
- **1.22.0** — **Dwie skóry regału + przełącznik (Holo+ domyślnie).** Skóry sterowane WYŁĄCZNIE
  zmiennymi CSS (`.skin-holo` / `.skin-noospheric` w `index.css`: `--sk-*` gradienty/kolory +
  `--noo-glow`/`--noo-accent2` triplety RGB używane przez keyframes i inline `rgba(var(--noo-glow),a)`),
  więc przełączenie to tylko podmiana klasy na wrapperze — zero prop-drillingu. **Holo+** = kolorystyka
  aplikacji (cyan `#22d3ee` + purpura `#a855f7` na adamancie/slate), **Relikwiarz** = dotychczasowy
  mosiądz+teal. Przełącznik w nagłówku „Regał" (segmentowy, cyan active); wybór trwa w localStorage
  (`shelfSkin`, domyślnie `holo`) — `src/utils/shelfSkin.ts`. Komponenty (`ShelfFrame`, `ShelfOrnaments`
  z `CogSigil` var-driven, `ShelfDivider`, `BookSpine`, `ShelfRow` plank, `Shelf` cokół/nóżki,
  `BookshelfSection` featured plank) czytają `var(--sk-*)`. Fizyka/color-code NIETKNIĘTE. Obie skóry
  zweryfikowane realnym renderem (Vite).
- **1.21.0** — **Regał w stylistyce „noosferycznej" Adeptus Mechanicus (cyfrowy relikwiarz).**
  Warstwa holo na mosiężnym korpusie: animowany **ticker danych** (marquee) w gzymsie, **godło
  cog-skull** z wolno obracającą się aureolą + pulsujący glow (`NoosphericCrest`), **narożniki HUD**
  (teal, pulsujące, zastąpiły mosiężne `CornerBracket`), **siatka noosfery + sweep skanline**
  (`HoloField`) we wnęce, **pieczęć czystości** z sygnaturą `IX-774`. Tabliczki dekad → runy mono
  (font `Share Tech Mono`) z cog-skull + świecąca żyła danych na deseczce + smużka projekcji.
  Grzbiety: teal rim-light + holo **sygnatura katalogowa** (`M####`, deterministyczna z id).
  Sigilla nagród z teal-obwódką. Animacje CSS (`.noo-*` w `index.css`) z guardem
  `prefers-reduced-motion`. Fizyka układania i color-code nagród NIETKNIĘTE. Zweryfikowane realnym
  renderem komponentów (Vite). Nowe/zmienione: `ShelfOrnaments` (+NoosphericCrest/DataTicker/HoloField/HudCorner,
  −CornerBracket), `ShelfFrame`, `ShelfDivider`, `BookSpine`, `index.css`.
- **1.20.2** — **Przekładka dekady = deseczka + tabliczka u góry** (wariant A). Zamiast dużej
  pionowej tabliczki (34×156): cienka **deseczka** (`DIVIDER_W` 34→10) stojąca między dekadami
  na dole toru + pozioma **tabliczka rocznika** u góry półki, wyrównana do początku zakresu
  (tylko przy pierwszym pojawieniu dekady — kontynuacja na nowym rzędzie bez podpisu). `ShelfDivider`
  przepisany (deseczka + tabliczka top-0, `BOARD_H`=`DIVIDER_H`=168 jako podpora fizyki);
  `ShelfRow` daje przekładce `z-15` (maluje się ponad granicznymi grzbietami). Fizyka NIETKNIĘTA.
- **1.20.1** — **Pola wielodatowe wpadają w dekadę** (nie „bez daty"). `parseYear(year)` w
  `bookshelf.ts` wyciąga pierwszy 4-cyfrowy rok z pola (`/\d{4}/`, `null` gdy brak); używany
  przez `decadeOf` (sortowanie tabliczek dekad) i `pubYear` (sort po dacie). Np. „1965/1966",
  „1959 (wyd. pol. 1972)", „wyd. 1948" → dekada zamiast „bez daty". +1 test (multi-date decadeOf).
- **1.20.0** — (1) **Tabliczki dekad**: generyczna przekładka `ShelfDivider` (parchment + mosiężny guzik,
  pionowy tekst) wstawiana na granicy każdej dekady wydania (`buildShelfItems` grupuje po `decadeOf`,
  kupki nie przekraczają dekady; `RenderSlot` + `PackItem`/`PlacedItem` kind `divider`). Etykieta
  generyczna (dziś „1950–1959", w przyszłości litera/nazwisko). (2) **Color-code nagród, bez nominacji**:
  `awardWins(book)` — tylko wygrane („Nagroda …"/„Wszystkie"), pomija „Nominacja …"; Hugo=złoty,
  Nebula=fioletowy, Locus=błękitny; kropki na grzbiecie/leżącej książce zamiast jednej bursztynowej.
  `hasAward` = `awardWins>0`. +8 testów (awardWins, tabliczki dekad). Screenshot OK. Fizyka NIETKNIĘTA.
- **1.19.2** — Regały mają **5 półek** (`pageSize` 3→5 dla obu). Podpis u góry „Regał N" (było „I/N").
- **1.19.1** — Powrót do **dwóch regałów** (lewy „Do przeczytania", prawy zawsze „Przeczytane",
  paginacja `Regał N/M`) — drag&drop po staremu; usunięte `LibraryWall`/`Bookcase`/`useMediaQuery`
  (ściana odrzucona). Numeracja regałów **arabska** (było rzymskie). **Sortowanie półek po DACIE
  WYDANIA** (rok rosnąco, brak roku → koniec; remis → tytuł) zamiast autor→tytuł (`byYearTitle`).
  +test (sort po roku, brak roku na końcu, override). Fizyka NIETKNIĘTA. `docs` §1b/§3 upd.
- **1.19.0** — **Gęsta pozioma ściana regałów** (desktop): `LibraryWall` pokazuje aktywną kolekcję
  (przełącznik Do przeczytania / Przeczytane) jako wiele **regałów po 5 półek** obok siebie,
  skalowanych transformem do wysokości viewportu (mierzy naturalny rozmiar regału + `innerHeight`),
  z oknem „Regały I–VI / N" (strzałki). Przenoszenie między kolekcjami: **dok upuszczania** na dole
  podczas przeciągania (`onDropBook(other)`). Nowe: `Bookcase` (regał stałej wielkości bez pomiaru),
  `LibraryWall`, hook `useMediaQuery`. Wąski ekran (<1024) → fallback do dwóch regałów paginowanych.
  Fizyka NIETKNIĘTA (regały używają `packAndLayout` przy `rowWidth=300`). Weryfikacja mockiem
  (6 regałów × 5 półek). Lint/testy/build OK. `docs` §1b upd.
- **1.18.0** — **Sala Archiwum**: regały stoją w POKOJU zamiast jednej długiej listy 700 pozycji.
  `RoomDecor` — ciepły skryptorium (drewniana ściana z panelami, podłoga, kinkiety z migoczącym
  światłem `motion`, kurz, proporzec, sygil koła zębatego, winieta; `aria-hidden`). Regały mają
  **stałą wysokość** (`Shelf` prop `pageSize=3` rzędy) i dzielą się na **segmenty „Regał I/N"** ze
  strzałkami; brakujące rzędy dopełniane pustą deską (stała wysokość); świeca na szczycie + cokół/
  nóżki („stoi na podłodze"). Wspólny builder `buildShelfItems` + `chunk` (`utils/shelfLayout.ts`),
  render rzędu wyjęty do `ShelfRow`/`EmptyShelfRow`. Fizyka książek NIETKNIĘTA. +3 testy (`chunk`).
  Weryfikacja mockiem-screenshotem. Wybór usera: ciepły / bogato / segmenty po kolei. **Iteracja 1** —
  możliwe rozszerzenie do gęstej poziomej ściany wielu regałów.
- **1.17.4** — **Brak powietrza między stojącymi książkami — luz pogrubia grzbiety**. Zamiast wkładać
  luz w szczeliny, `layoutRow` po oparciu pochyłych POGRUBIA stojące grzbiety (`PackItem.stretch`,
  water-filling `widenEvenly`, waga ~ długość tytułu → dłuższy tytuł = grubsza książka). Książki się
  stykają jak na prawdziwej półce; kupki/pochyłe nie grubieją; dopiero po nasyceniu limitów zostaje
  włoskowa równa szczelina. `PlacedItem.w` (szerokość renderowania), `Shelf` renderuje grzbiet `p.w`.
  +2 testy (pogrubienie zeruje szczeliny; fallback równych szczelin przy `stretch=0`). Reguła 13 upd.
- **1.17.3** — **Koniec pustych „dziur" w rzędzie**: luz (po oparciu pochyłych) rozkładany RÓWNO na
  wszystkie szczeliny między stojącymi grzbietami zamiast skupiania w kilka przerw. Minimalizuje
  największą szczelinę → pełny rząd ma włoskowe szwy, rzadki rozkłada się równo (żadnej dużej dziury).
  Usunięte `STRAIGHT_GAP`/`MAX_BREAK` i logika „break". Reguła 13 w docs zaktualizowana. +test (równe
  szczeliny, fill do prawej). Screenshot OK.
- **1.17.2** — Stojące książki jeszcze bliżej + **reguły modułu w dokumentacji**. Szew między prostymi
  grzbietami zmniejszony do `STRAIGHT_GAP=1 px`, `packRows` minGap 3→2; nadmiar luzu trafia do
  minimalnej liczby „przerw" (każda ≤ `MAX_BREAK=34 px`, równo rozłożone) zamiast co-4-tej szczeliny.
  `docs/bookshelf.md` §1a — cały arc `1.16.0→1.17.2` ujęty jako **reguły działania** (15 punktów:
  mebel/deski, pozy, kupki, fizyka fill+oparcie+zwarcie, pełne nazwy, drag). +test (zwarte + przerwy ≤cap).
- **1.17.1** — Fizyka: **stojące równo książki blisko siebie**. `layoutRow` przycina szczelinę
  między prostymi grzbietami do `STRAIGHT_MAX=3 px`; luz w pierwszej kolejności pochłaniają pochyłe
  (oparcie), a dopiero nadmiar trafia do rzadkich „przerw" (co 4-tą wolną szczelinę) → zwarte grupki
  zamiast równomiernego rozjazdu. Rząd nadal wypełniony do prawej krawędzi. +test. Screenshot OK.
- **1.17.0** — **Fizyka regału** (nowy `utils/shelfPacking.ts`): (1) **każda półka wypełniona** —
  `Shelf` mierzy szerokość (`ResizeObserver`), pakuje woluminy w rzędy i rozdziela luz tak, że rząd
  spina lewą i prawą krawędź (bez dziury na końcu); (2) **pochylenie z podparciem** — książka pochyla
  się TYLKO gdy ma szczelinę do oparcia; kąt `θ=atan(szczelina/wys_podpory)` (≤MAX_LEAN, pivot w rogu
  podstawy od strony podpory) → wierzch dosięga górnej krawędzi sąsiada/kupki, nie wisi bezwładnie.
  Rząd ciasny → książki stoją prosto (emergentna fizyka). Render przeszedł z flex-wrap na własne
  rzędy z deską per-rząd; usunięty martwy `leanLayout`. `layoutStack` zwraca `height` (podpora).
  +8 testów fizyki (fill, kąt oparcia, brak pochyłu przy 0-luzie i na krawędzi). Screenshot OK.
- **1.16.7** — Kupki: **mniej ich** (próg `planShelf` 92→95 → ~5%) + **zmienne ułożenie**. Nowy pure
  `layoutStack(books)` (+`stackAlign`/`stackChaos`/`layerJitter`): wyrównanie kupki często do lewej,
  często do prawej, **bardzo rzadko symetryczna piramida** (center ~10%), plus opcjonalny „chaos"
  (~⅓ kupek: 3–7 px poziomego rozjazdu warstw). Sortowanie największa-na-dole zachowane. `flatBookLayout`
  bez zbędnego arg `style`. `BookStack` używa `layoutStack` (offset `x` per warstwa). Gwarancja
  `0≤x≤cellW−width` (brak wystawania). +4 testy (sort, containment, rozkład align, chaos). Screenshot OK.
- **1.16.6** — Kupki dopracowane (3 reguły): (1) **sortowanie od największej na dole do najmniejszej
  na górze** — `BookStack` sortuje warstwy malejąco po szerokości (piramidka, wyśrodkowana, bez
  jittera); (2) **grzbiety sąsiadujące z kupką przechylają się w jej stronę** — `planShelf` nadpisuje
  pozę sąsiadów (`LEAN_TOWARD=5`; lewy w prawo, prawy w lewo); (3) **dwie kupki nigdy nie sąsiadują**
  — po kupce następny slot to zawsze grzbiet (zablokowana kupka → prosto). +2 testy (brak sąsiednich
  kupek, sąsiedzi pochyleni ku kupce). Screenshot OK. `docs/bookshelf.md` upd.
- **1.16.5** — Leżące książki: **zawijanie tytułu do 2 linii zamiast poszerzania**. `flatBookLayout`
  ma limit szerokości `FLAT_MAX_W=150`: krótki tytuł → 1 linia (książka na tekst), dłuższy → 2 linie
  (książka trochę grubsza, nie szersza; `lines` w zwrotce). Bardzo długi → dodatkowo mniejsza czcionka,
  aż połowa mieści się w linii (2 linie zawsze wystarczą, brak ucinania). `BookStack` renderuje tytuł
  przez `-webkit-line-clamp`. +test (short=1 linia, long=2 linie i width=cap, grubszy). Screenshot OK.
- **1.16.4** — Większe kupki (`planShelf` stack **4–7** realnych książek, było 2–4) + **pełne nazwy
  na każdej książce** (bez ucinania). `spineFontSize(style,title)` dobiera czcionkę stojącego
  grzbietu (6–11 px) tak, by cały tytuł zmieścił się na wysokości; `flatBookLayout(book,style)` dobiera
  szerokość+czcionkę+grubość leżącej książki pod pełny tytuł (grubość 15–18, książka szersza dla
  dłuższego tytułu, mniejsza czcionka gdy bardzo długi). `BookStack`/`BookSpine` usuwają `truncate`/
  `max-h-80%`. +2 testy (skalowanie czcionki, szerokość mieści tytuł). Screenshot OK. `docs` upd.
- **1.16.3** — Pozy dostrojone: **mniejszy przechył** (max 6°, `MAX_LEAN_DEG`; było 4–11 → teraz 3–6),
  **więcej stojących prosto** (~80% vs 66%), a **każda książka w kupce to OSOBNY prawdziwy wolumin**
  (własny tytuł/kolor/nagroda/drag), nie jeden grzbiet udający stos. Model przebudowany: `spinePose`+
  `FlatBook` → `planShelf(books)` zwraca sloty `spine|stack` (kupka = 2–4 kolejne realne książki);
  `leanLayout` (dawne `spineLayout`) trzyma regułę braku nachodzenia; nowy `BookStack` renderuje
  warstwy jako osobne książki. +testy (każda książka w 1 slocie, kupka ≥2 różne id, kąt ≤6). Screenshot OK.
- **1.16.2** — Pozy: więcej książek w stosiku (`flat` layers **3–5**, było 1–3) + **reguła: żadna
  książka nie nachodzi na drugą**. Nowy helper `spineLayout(style, pose)` — komórka rezerwuje
  szerokość obróconego grzbietu (`cellW = W·cosθ + H·sinθ`) i przesuwa go (`shiftX`), by bbox był
  wyśrodkowany; przechylony wolumin zostaje w swoim torze (między komórkami `column-gap`). +2 testy
  (containment 4 narożników, footprint prosto/flat). Weryfikacja screenshotem. `docs/bookshelf.md` upd.
- **1.16.1** — Dynamika póz na półce: `spinePose(book)` (deterministyczna, avalanche-mix hasza →
  równomierny rozkład niezależny od korpusu): ~66% stoi prosto, ~27% przechylone (`lean`, 4–11°,
  pivot u podstawy — oparte o sąsiada), ~7% leży na płask jako mały stosik (`flat`, 1–3 książki,
  `FlatBook` z widoczną krawędzią kartek). Poza to tylko `transform`/inny render w komórce — NIE
  rusza stałej wysokości toru, więc deski dalej się zgadzają. Drag&drop zachowany. +3 testy
  (determinizm, zakresy, rozkład). Weryfikacja wizualna screenshotem. `docs/bookshelf.md` zaktualizowany.
- **1.16.0** — Regał jako mebel: prawdziwy korpus `ShelfFrame` (drewniany gzyms + boki + cokół,
  ciemne „plecy" z pionowymi deskami) + ozdoby Mechanicus `ShelfOrnaments` (mosiężne narożniki,
  sygil koła zębatego z czaszką, zwisająca pieczęć czystości — dekoracyjne, `aria-hidden`).
  Każdy rząd grzbietów stoi na osobnej **desce** — trick: komórki o stałej wysokości `SHELF_ROW_H`
  (>171 px grzbiet) → każdy zawinięty wiersz skacze o `ROW_H+GAP`, więc jeden powtarzalny gradient
  (`shelfPlankBackground`, testowany) trafia deską pod każdy rząd niezależnie od szerokości.
  Półka „Do przeczytania" mieści **wszystkie** woluminy (zdjęty scroll-cap `max-h-520`).
  Ramę reużywa też „Wyróżnione". +2 testy (helper deski). Weryfikacja wizualna: screenshot
  headless-chromium potwierdził wyrównanie desek. `docs/bookshelf.md` zaktualizowany.
- **1.15.11** — Audyt #2 krok 4/4 (#102): `StatsSection` (NIE god — spójny dashboard, ale
  pod-wyekstrahowany). Logika oznaczania → hook `useMarkAsRead` (stan `markingId`/`markedIds`
  + optymistyczny update filii / pełny refetch „Przeczytane"); wiersz posiadane-nieprzeczytane
  → `stats/OwnedUnreadItem`; siatka pokrycia nagród (`Math.round(count/total)`) → `stats/AwardCoverageGrid`.
  Zachowanie 1:1, 270 testów. **Audyt #2 zamknięty (kroki 1–4).**
- **1.15.10** — Audyt #2 krok 3/4 (#102): `SchemaEditor` (mild God-Component) **296 → 88 linii**
  (cienki orkiestrator). Inline PATCH ×2 + walidacja duplikatu → hook `useSchemaMutations`
  (`patchOptions` wspólny, `addOption`/`deleteOption`); inline modal usuwania → generyczny
  `ConfirmDialog`; wielka karta kolumny → `SchemaColumnCard` (`key!=='Autor'` skonsolidowane w
  `isEditable`). Zachowanie 1:1, 270 testów.
- **1.15.9** — Audyt #2 krok 2/4 (#102): App.tsx (God-Component) **332 → 149 linii** (czysta
  powłoka). Wyciągnięte `LiturgySection` (blok zakładki config + własny `useConfig`, `useSyncManager`
  propem `sm`) i `TabNav` (5× copy-paste przycisków → mapa). Error-card ZOSTAJE w App (globalny,
  na każdej zakładce) — jedna instancja `useSyncManager`. Zachowanie 1:1, 270 testów.
- **1.15.8** — Audyt #2 krok 1/4 (#102): rozbicie God-Component `SyncSummaryResult` 256 → 25
  linii (dispatch). Panel listy powielony 5× → `sync/SummaryDetailPanel` (4×) + jeden gęsty
  inline w `FullSyncSummary`; stat-grid → `sync/StatCard`; clipboard → hook `useCopyToClipboard`;
  dwa tryby → `FullSyncSummary`/`SingleSyncSummary`. Zachowanie 1:1, 270 testów.
- **1.15.7** — Bughunt po zmianach (#100). 4 audyty (useSSEStream, vintedSyncService, rozbicie
  VintedCheckItem = FAITHFUL/czyste). 2 realne bugi w nowych featurach naprawione:
  (1) Regał: wyścig drag&drop — zapisy per-książka SERIALIZOWANE (latest-wins, `pendingRef`/
  `runningRef`), koniec nakładających się nieatomowych RMW rozjeżdżających Notion z UI.
  (2) Katalog/Regał: `useBooks` startuje `loading=true` (fetch w useEffect po paint dawał
  mignięcie pustego stanu); SearchSection rozróżnia pusty-query („Archiwum jest puste") od braku
  trafień. Minor „overrides nie czyszczone" — poprawne przy single-fetch, zostawione.
- **1.15.6** — `useSSEStream` (deferred z audytu god-object): wspólny transport SSE
  (POST → `res.ok` → `consumeSSE` + watchdog + derywacja komunikatu błędu/stall). Trzy hooki
  streamowe zbudowane na nim, różnią się tylko routingiem zdarzeń: `useSync` 154→100 (koniec
  inline-watchdoga — teraz `createStallWatchdog` przez primitive), `useVintedCheck` 168→145,
  `useLibraryCheck` 121→89 (usunięty antywzorzec `new Promise(async…)` — `checkLibrary` to
  zwykły async). +4 testy. Drobna zmiana: błąd HTTP biblioteki pokazuje realny komunikat
  serwera zamiast hardkodu. Zachowanie poza tym 1:1 (komunikaty stall zachowane, useSync ma
  swój dłuższy wariant). CLAUDE.md zaktualizowany. `notion.adapter` — dedup
  `add`/`removeTagFromMultiSelect` → prywatny `mutateMultiSelect(pageId, prop, transform)`
  (retrieve→mutate→update w jednym miejscu; `transform` zwraca `null` = no-op). Zachowanie 1:1.
  DEFERRED (opcjonalne, medium): pełny split adaptera na Source/SchemaAdmin/BookRepository,
  ewikcja literałów domeny (`VintedData`/`Wydawnictwo`/`Lp`) i `useSSEStream` (3 hooki streamowe
  duplikują szkielet fetch+watchdog+routing). Cały audyt god-object zamknięty (kroki 1–5).
- **1.15.4** — God-object krok 4/5 (#91): `vintedSyncService` 409 → 283 linii. Pure logic
  wyjęta do testowalnych helperów: `vintedScanPlanner` (`selectAndOrderCandidates`/`scannedMs` —
  filtr kandydatów + okno „Kontynuuj" + sort od najstarszych, `now` wstrzykiwalny), `vintedHttp`
  (`vintedRequestHeaders`/`memMb`/`throttle`/`classifyVintedError` — dedup 4× jitter-sleep i
  gałęzi 429/403), `looksEmpty` w parserze (obok `looksBlocked`), `computeChangedAt`+`toStoredBookView`
  w store. Dedup 2× guard „persist empty tylko gdy nic nie było" → prywatny `persistEmptyIfNew`.
  Zachowanie (SSE, kolejność, guardy) 1:1, +13 testów. Klasy NIE rozdzielałem (ryzyko DI/registry) —
  opcjonalny split scan/seller/store-view zostaje jako deferred.
- **1.15.3** — God-object krok 3/5 (#91): `useSyncManager` (God-Hook). „Wielki Rytuał" opisany
  DANYMI (`FULL_SYNC_STEPS[]` + pętla; 7× copy-paste → 1 pętla, `abortOnFail` per krok).
  `handleAwardChange` przyjmuje `string` (nie `ChangeEvent`) — parsowanie `<select>` zostaje w
  `SyncAwards` (manager niezależny od prezentacji, zgodnie z GUIDELINES §2). Zachowanie bez zmian.
- **1.15.2** — God-object krok 2/5 (#91): rozbicie God-Component `VintedCheckItem` **528 → 75
  linii**. 6 komponentów w `src/components/stats/vinted/`: `VintedScanControls`, `VintedScanProgress`,
  `VintedDebugLog`, `VintedResolveStatus`, `VintedBundleList` (własny `bundleSort`), `VintedBookResultList`
  (+ wewn. `OfferRow`). Parent = kompozycja + wybór źródła danych + handlery cross-domain. Zachowanie bez zmian, 253 testy.
- **1.15.1** — God-object audyt + krok 1/5 (#91): ekstrakcja czystych helperów z God-Component
  `VintedCheckItem` (528 l.) do `src/utils/vintedFormat.ts` (`shortDate`, `formatDebug`,
  `isBookChanged`, `offerBadges`) — ~40 linii logiki-w-JSX out, +8 testów. Audyt SRP wykazał
  4 winowajców: VintedCheckItem (God-Component), `useSyncManager` (God-Hook: rejestr+polityka+
  7-krokowa saga+parsing DOM), `vintedSyncService` (`runVintedCheck` god-metoda 225 l. + 3
  concerny/klasa), `notion.adapter` (God-Adapter: literały domeny + dup metody). Oczyszczone:
  `syncController` (płaski), `useSync` (wzorzec). Dekompozycja w krokach 2–5.
- **1.15.0** — „Regał Archiwum" (#89): zakładka z wizualizacją księgozbioru jako fizyczne
  półki (koncept A grzbiety + B półka okładek „Wyróżnione"=read+nagroda). Dwa regały „Do
  przeczytania"/„Przeczytane" z **drag&drop** (HTML5 DnD); upuszczenie zapisuje/usuwa tag
  „Przeczytane" w „Źródło" (optymistyczny stan `overrides` + revert przy błędzie). Backend:
  `removeTagFromMultiSelect` + `syncManager.unmarkRead` + `POST /api/unmark-as-read` (guard
  `ALLOWED_SOURCE_TAGS`), symetryczne do `markAsRead`; cache książek inwalidowany. Czyste
  `src/utils/bookshelf.ts` (`spineStyle` deterministyczny, `splitShelves`, `featuredReads`).
  BUG złapany testem: `h >> 3` (znakowe) → ujemne dla hashów >2^31 → `>>> 3`. +9 testów.
- **1.14.0** — Paczki Vinted: przełącznik sortowania „Najwięcej książek" / „Najtańsza paczka".
  Czysta `sortBundles(bundles, mode)` (`count`: najwięcej książek → remis najtańsza suma;
  `price`: najtańsza `totalValue` → remis najwięcej książek), zwraca kopię (bez mutacji).
  `groupBySeller` deleguje do `sortBundles(..,"count")`. Toggle w nagłówku paczek. +3 testy.
- **1.13.1** — Katalog (#84): klik podpowiedzi podmienia TYLKO ostatni token (czysta
  `replaceLastToken`), nie całe pole. „Greg Vear" + „Bear" → „Greg Bear" (nie samo „Bear").
  Fokus wraca do inputu. +4 testy.
- **1.13.0** — Katalog „Czy chodziło Ci o…" (#82): fuzzy-podpowiedzi na literówki. Gdy
  `matchBooks`=0, `didYouMean` liczy Levenshteina między OSTATNIM tokenem zapytania a słownikiem
  `buildSearchVocab` (słowa tytułów PL+oryg + autorów, dedupe po foldzie, display z wielką literą);
  próg wg długości (≤4→1, ≤7→2, dłuższe→3), odsiew po |Δlen|, pomija dystans 0. UI: klikalne
  „Perelandra?" ustawia query. +6 testów. Wszystko client-side.
- **1.12.1** — Katalog fixy (#80): (1) indeks dopuszcza rekordy z tytułem PL **lub**
  oryginalnym (nieprzetłumaczone książki wypadały — 684 pokazywało ~389); karta/ranking
  używają tytułu efektywnego `plTitle || origTitle`. (2) badge nagród i tagi źródła w dwóch
  osobnych wierszach (ikony `Award`/`Tag`). (3) zakładki równej szerokości (`sm:flex-1` +
  `items-stretch`, `tracking-wide`, `px-4`). +1 test (origTitle-only).
- **1.12.0** — „Katalog": wyszukiwarka rekordów archiwum (4. zakładka). Nowy
  `GET /api/books` zwraca odchudzony `BookIndexEntry[]` (mapper `services/bookSearchIndex.ts`,
  reużywa `getBooksForStats({cache})`). Front filtruje CAŁOŚĆ client-side (`useBooks` fetch raz,
  `src/utils/bookSearch.ts`: fold diakrytyków per-znak — 1:1 na długość → highlight; `matchBooks`
  AND-po-tokenach po tytule PL+oryg+autor; ranking prefiks>substring). `useDeferredValue` (React 19)
  trzyma input płynny. `per`→wiele, `pere`→Perelandra. UI: `SearchSection` + `search/BookResultCard`
  (badge nagród/źródła/cykl) + `HighlightedText`. +10 testów matchera. RENDER_CAP=150.
- **1.11.2** — Oznaczanie cykli: naprawa „czasem nie łapie". Root cause = CICHE pominięcia:
  gdy nie znaleziono strony wiki (niedopasowany tytuł) lub autor się nie zgadza, książka była
  `return`-owana bez śladu, a `complete` raportował sam sukces. Teraz `syncSummary.skipped`
  zbiera pominięte z powodem (nie znaleziono strony / autor się nie zgadza), a wynik niesie
  `cyclesDetected` + `skipped`; `SyncSummaryResult` pokazuje listę „Pominięte — nie oceniono".
  Regex szablonu poszerzony `\{\{Cykl\s*\|` → `\{\{\s*cykl[\s|}]` (łapie `{{Cykl}}` i
  `{{Cykl nawigacja|…}}`, wciąż odrzuca `{{Cyklista}}`). Zweryfikowane na realnym rawie
  „Inny"/Dickson: `|cykl = Childe` JEST łapane (regex pola OK), pusty `|cykl=` = false,
  `|seria=` świadomie pomijane (imprint wydawcy). +5 testów.
- **1.11.1** — Metadane (rok + ikonka „cykl") także w PACZKACH sprzedawców, nie tylko na
  kafelkach. `SellerBundleEntry` niesie `bookYear`/`bookPartOfCycle` (z `VintedResult`),
  `groupBySeller` je przepisuje, a wpis paczki pokazuje rok przy autorze i badge „cykl".
- **1.11.0** — Kafelki z bazy bogatsze o metadane z Notion (bez scrapowania): rok wydania
  (kolumna „Rok") przy autorze i ikonka „cykl" (kolumna „Część cyklu"=true) — sygnał
  ryzyka „kolejny tom". `getStoredData` niesie `year`/`partOfCycle`; `storedToView` + kafelek
  je pokazują.
- **1.10.2** — „Kontynuuj" naprawione: skan zawsze OD NAJSTARSZYCH (`scannedAt` rosnąco,
  nigdy-skanowane pierwsze), a okno pomijania w GODZINACH (`skipScannedWithinHours`, dom.
  12 h) zamiast dni. Bug: po częściowym pełnym skanie (160 dziś + reszta wczoraj) „Kontynuuj"
  (3 dni) pomijał WSZYSTKO < 3 dni → silent drop. Teraz pomija tylko bieżącą partię (< 12 h),
  a wczorajsze/starsze robi od najstarszych.
- **1.10.1** — Bughunting runda 2 (3 agenty). NAPRAWIONE: (dane) gałąź „Brak wyników"
  kasowała oferty bez guardu `hadStored` (fałszywy substring w 7 MB) → teraz nie nadpisuje;
  (change-detect) pierwszy skan/migracja fałszywie oznaczały „zmiana"/„nowa" → `changedAt`
  tylko przy baseline, survivor zachowuje oryginalny `firstSeenAt` (undefined dla starych
  blobów), „nowa" wymaga changedAt===scannedAt; dedupe URL w `mergeAndDiff`; (UI) wyścig
  wczytania z bazy porywał widok po starcie skanu/resolucji → pokolenie+abort w
  `useVintedStored` + `clearStored` na starcie resolucji; stabilny klucz miniatur;
  brak podwójnej notki pustego stanu; (infra) `res.on('error')` w SSE (koniec uncaughtException),
  guard kluczy Notion na resolve/stored. Reszta infra: czyste (lock, cache, agent, chunking).
- **1.10.0** — Wykrywanie zmian przy odświeżaniu. `mergeAndDiff` (zamiast `mergeOffers`):
  liczy nowe/zniknięte/spadek/wzrost ceny, zachowuje sprzedawcę + `firstSeenAt`, zapisuje
  `prevPrice`; `changedAt` w blobie (kiedy ostatnio się zmieniło). Widok z bazy: badge
  książki „zmiana", oferty „nowa" i „−X zł" (spadek); diff też w logach debug (Δ +/−/↓/↑).
  Odświeżanie = re-scan (Kontynuuj/pełny) — bez zmian, teraz z widoczną deltą.
- **1.9.1** — Bughunting (3 agenty). NAPRAWIONE: (KRYTYCZNE) re-scan z blokadą/missem parsera
  kasował składowane oferty i sprzedawców — `looksBlocked` teraz `continue` (nie kasuje,
  nie stempluje scannedAt → wznowienie ponawia), a „0 ofert bez markera" nie nadpisuje,
  gdy wcześniej coś było. (UX) skan z widoku bazy chował świeże wyniki → `clearStored` na
  starcie; start skanu zablokowany w trakcie resolucji (nieanulowalność); pusty odczyt bazy
  ma notkę. Odrzucone jako nie-bug po weryfikacji na realnym HTML: /member regex (seller to
  jedyny numeryczny link), aria-label ceny (ochrona na początku, wygrywa węzeł tekstowy).
- **1.9.0** — Usunięto live-grupowanie (przyciski „Najtańsze"/„Wszystkie oferty" — Rytuały
  Kartelu) zastąpione ścieżką bazodanową (Ustal sprzedawców → Wczytaj z bazy). Wycięty
  martwy kod: hook `useVintedGrouping`, endpoint `/api/vinted-group` (+task, controller),
  metoda `resolveSellers` (live). `groupBySeller`/`storedToView` zostają (paczki z bazy).
  Sprzedawcy do paczek pochodzą teraz wyłącznie z bazy; live scan pokazuje same kafelki.
- **1.8.0** — Przyciski skanera w stylu rytuałów liturgii synchronizacji. Nowy reużywalny
  `RitualButton` (ciemna baza slate-950 + kolorowy hover-glow/scale + ikona w boxie +
  „Rytuał X" + uppercase podtytuł); motyw rozszerzony o `ritualButtonTheme` (literały klas).
  Akcje skanera przeniesione z „głośnych" pilli do siatki rytuałów (Skanowania /
  Identyfikacji Handlarzy / Przywołania z Archiwum / Kartelu). Checkbox „Kontynuuj" i
  logi zostają w nagłówku. Test App zaktualizowany do nowych etykiet.
- **1.7.1** — „Ustal sprzedawców (baza)": zdjęty cap 150 (domyślnie bez limitu — jeden
  przebieg ustala wszystkie brakujące). Bezpieczne dzięki wznawialności (zapis raz/książkę)
  i throttlingowi (to on chroni rate, nie liczba total). `cap` z body wciąż opcjonalny.
- **1.7.0** — Skan taguje źródło: książka z ofertami na Vinted (match) dostaje tag
  „Vinted" w kolumnie Źródło (`addTagToMultiSelect`, best-effort, guard po `zrodlo` by
  nie pisać zbędnie przy re-scanie). Tylko dodaje; nie usuwa gdy oferta zniknie.
- **1.6.0** — Vinted skan wznawialny: checkbox „Kontynuuj" (dom. ON) pomija książki
  skanowane < 3 dni (`skipScannedWithinDays` z `scannedAt` w blobie) → skan rusza od
  niezrobionych zamiast od zera. Łagodzi limit ~160/kontener i drop połączenia na mobile
  (przełączenie apki usypia kartę → SSE pada → serwer anuluje; teraz po prostu wznawiasz).
- **1.5.0** — Vinted persystencja ETAP 3 (domknięcie): grupowanie i kafelki Z BAZY bez
  re-scrape. `getStoredData` (`GET /api/vinted-stored`) czyta bloby wszystkich książek;
  czysty `storedToView` mapuje na VintedResult[] + sellersByUrl + zakres świeżości.
  Hook `useVintedStored`, przycisk „Wczytaj z bazy"/„Wyczyść", baner „Dane z bazy" +
  `scannedAt` na kafelku. Kafelki i paczki reużywają istniejący render.
- **1.4.0** — Vinted persystencja ETAP 2: przyrostowe dociąganie sprzedawców DO BAZY.
  `resolveSellersToStore` czyta składowane oferty bez sprzedawcy, dociąga (throttled,
  cap 150/przebieg, wznawialne — rozpoznani zostają w blobie), zapisuje raz/książkę.
  Task `vinted-resolve-sellers`, endpoint `POST /api/vinted-resolve-sellers`, hook
  `useVintedResolveSellers`, przycisk „Ustal sprzedawców (baza)" + postęp/wynik.
- **1.3.0** — Vinted persystencja ETAP 1 (fundament): wyniki skanu zapisywane do Notion
  (blob JSON w polu `VintedData`, chunk ≤2000 zn., mapper skleja). `vintedStore` (pure:
  serialize/parse/merge — merge ZACHOWUJE sprzedawcę dla ofert z niezmienionym URL).
  Skan zapisuje per książka best-effort (match/0 ofert) + `scannedAt`. Adapter:
  `saveVintedData` + `createColumnIfNeeded("VintedData")`. Payoff (grupowanie/kafelki
  z bazy) = ETAP 2/3, następne PR.
- **1.2.0** — Vinted grupowanie: tryb „Wszystkie oferty" (obok „Najtańsze"). „Wszystkie"
  dociąga sprzedawcę KAŻDEJ oferty (cap 150 + raport pominięć), ujawnia many-to-many
  (dopłać grosze, skonsoliduj przesyłkę). `groupBySeller` bierze najtańszą kopię per
  sprzedawca/książkę i liczy dopłatę vs najtańsza globalnie (`premium`/`totalPremium`),
  pokazaną w UI. Backend bez zmian (ten sam `resolveSellers`, tylko więcej URL-i).
- **1.1.0** — Vinted: grupowanie per sprzedawca (on-demand, „low hanging fruit").
  Przycisk „Grupuj per sprzedawca" dociąga sprzedawcę ze strony najtańszej oferty każdej
  książki (`extractVintedSeller`: `/member/{id}` + `data-testid="profile-username"`),
  serwis `resolveSellers` (SSE, throttling jak skan, cap 100, zdarzenie `seller_resolved`),
  endpoint `POST /api/vinted-group`, czysty `groupBySeller` (≥2 książki) + sekcja UI.
- **1.0.4** — Skaner Vinted: self-kill NAPRAWIONY (KROK 3). Root cause POTWIERDZONY logami
  Rendera: `JavaScript heap out of memory` przy ~268 MB, heap rósł monotonicznie
  ~10 MB/książkę (pełny GC nie zwalniał). Przyczyna: V8 SlicedString — pola oferty
  wyłuskane regexem z 7 MB HTML trzymały wskaźnik do całego rodzica, a `results` je
  akumulowało → każde trafienie pinowało 7 MB. Fix: `detach()` (kopia bajtów) na polach
  z HTML w `parseVintedItems` (ścieżki 3/4). Zero zmian w timingu.
- **1.0.3** — Skaner Vinted: self-kill debug KROK 2 (obserwowalność pamięci). `rssMb`/
  `heapMb` w debug każdej próby + log serwera. KROK 1 (watchdog 120 s) NIE pomógł —
  skan padł nawet wcześniej (26 vs 28), co wyklucza front-owy watchdog. Nowa hipoteza:
  OOM-kill na Render (strony ~7 MB × ~27 → piki pamięci > 512 MB). Zero zmian w timingu.
- **1.0.2** — Skaner Vinted: self-kill debug KROK 1. Front-owy stall-watchdog dla Vinted
  30 s → 120 s (izolowana bezpieczna połowa cofniętego #48; NIE rusza timeout/retry
  scrapera, więc nie zmniejsza trafień). Pokrywa worst-case ~102 s ciszy na jednej
  wolnej/blokowanej książce. Zakres: tylko `useVintedCheck`.
- **1.0.1** — Vinted parser dostrojony do aktualnego DOM Vinted (siatka feed-grid po
  hashowanej klasie, cena strukturalna + miniatury; fix `hasFeedGrid`). Wprowadzenie
  wersjonowania w `metadata.json` i trwałej pamięci `backlog.md`. (PR #52 + workflow rules)
- **1.0.0** — Stan bazowy.

## Otwarte pozycje

- **Podgląd cyklu (Katalog) — fetch z Encyklopedii bywa zawodny na produkcji; ewent. proxy egress.** ZGŁOSZENIE
  usera: po kliknięciu badge cyklu w Katalogu podgląd (`CyclePanel` → `useCycle` → `GET /api/cycle`) czasem nie
  wchodzi; hipoteza usera: „blokowane przez Render". MECHANIZM (zweryfikowany w kodzie): fetch jest SERWEROWY —
  `CycleLookupService` → `WikiAdapter` → `https://encyklopediafantastyki.pl/api.php` (MediaWiki), czyli TEN SAM
  host + adapter + IP Render, co book sync. Jeden podgląd bez cache = do ~34 SEKWENCYJNYCH żądań
  (`MAX_HOPS=15` w każdą stronę po łańcuchu `poprzednia`/`następna` + search + sąsiedzi), każde `withRetry(3, 2s)`,
  timeout 30 s. Cache: `BoundedCache(500)` w pamięci procesu → ZIMNY po każdym deployu.
  - **POTWIERDZONE (log Render, 2026-09-26):** `class=ip_blocked, status=403`, body = ZWYKŁA strona Apache
    „403 Forbidden / You don't have permission to access this resource" — czyli ORIGIN encyklopedii odrzuca IP,
    a NIE challenge Cloudflare (brak strony CF, brak JS-challenge). Retry `withRetry` też dostaje 403 (twardy blok
    na zasób, nie chwilowy rate-limit). Konsekwencja: to blokada IP/ASN datacenter Render, a NIE wymaga
    przeglądarki/`cf_clearance` (inaczej niż Vinted) — wystarczy INNE, niedatacenterowe źródłowe IP.
    UWAGA: skoro to blok IP, book sync leci tą samą ścieżką → prawdopodobnie też oberwie 403 (do potwierdzenia,
    ale to znaczy, że fix należy zrobić na poziomie `WikiAdapter`, nie tylko endpointu cyklu — naprawia OBA).
  - **Cloudflare Worker (pomysł usera) — OCENA po logu:** ponieważ to zwykły 403 origINU (nie challenge),
    proxy zmieniające IP JEST właściwym kierunkiem i NIE trzeba headless-browsera. CF Worker: darmowy, szybki,
    egress z IP Cloudflare (inne niż Render) — realna szansa, że przejdzie. RYZYKO: zakresy egress CF bywają też
    blokowane przez WAF-y; jeśli encyklopedia blokuje też CF, wróci 403. To 20-min eksperyment, nie pewnik.
  - **ZREALIZOWANE (1.84.0, hydraulika + Worker) — CZEKA NA WDROŻENIE PRZEZ USERA:** `WikiAdapter` ma teraz
    konfigurowalny egress: `resolveWikiBaseUrl()` czyta `WIKI_PROXY_URL` (puste = origin bezpośrednio, zero zmiany),
    `WIKI_PROXY_KEY` idzie nagłówkiem `X-Proxy-Key`. Działa dla DOWOLNego proxy i naprawia też book sync. Gotowy
    `cloudflare/wiki-proxy.js` (reverse-proxy api.php, GET-only, gate na sekret, edge-cache 5 min, przepuszcza
    status by realny 403 był widoczny). DO ZROBIENIA PO STRONIE USERA: wdrożyć Workera (dashboard/wrangler),
    ustawić `PROXY_KEY` na Workerze + `WIKI_PROXY_URL`/`WIKI_PROXY_KEY` na Render, redeploy. Instrukcja w nagłówku
    pliku Workera + `.env.example`. JEŚLI Worker też dostanie 403 (CF egress blokowany) → te same 2 env-y, ale URL
    proxy rezydencjalnego. ORTOGONALNIE (nie zrobione, opcjonalne): czytać najpierw WIERSZE bazy (Żniwa materializują
    tomy) i pytać wiki tylko o luki — mniej ruchu, ale nie usuwa samej blokady.
- **Katalog: klik w ikonę książki → podgląd szczegółów z Encyklopedii (NOWY feature, pomysł usera).** Ikona
  `BookMarked` w `BookResultCard` (linia ~46) jest dziś CZYSTO DEKORACYJNA (brak `onClick`). Pomysł: klik otwiera
  popover ze szczegółami książki, analogicznie do `CyclePanel`, przez nowy endpoint serwerowy pobierający stronę
  wiki tej książki (1 fetch, nie ~34 — dużo lżejszy niż podgląd cyklu). ZALEŻNOŚĆ: dokłada ruch do tego samego
  egressu co wyżej, więc sensownie robić PO rozstrzygnięciu kwestii pobierania z Encyklopedii. Reuse:
  `WikiAdapter.fetchPageContent` + parser pól (autor/wydania/seria już parsowane w `wiki.parser`), wzorzec
  popovera i `computePopoverPosition` z `CyclePanel`.

- **Katalog: skaner kodów kreskowych (mobile) — feature ZREALIZOWANY (A+B), 3 PR-y.** Cel: LOOKUP
  („czy ta fizyczna książka to jedna z moich śledzonych nagrodowych?"), NIE dodawanie do bazy. Decyzje
  użytkownika: A+B, zgoda na Google Books (external), sprzęt=Android → natywny `BarcodeDetector` (bez nowej
  zależności skanera). Rdzeń problemu: baza Notion NIE trzyma ISBN → kod nie dopasuje wiersza wprost.
  - **PR1 — backend resolver ISBN (wariant A)** — ✅ ZREALIZOWANE (1.49.0). `services/isbn.ts` (`normalizeIsbn`)
    + `services/isbnLookupService.ts` (`lookupIsbn` Google Books, cache) + `GET /api/isbn/:code`.
  - **PR2 — kolumna `ISBN` w Notion + rytuał wzbogacania (wariant B)** — ✅ ZREALIZOWANE (1.50.0). Kolumna
    `ISBN` w `requiredProps`; `IsbnEnrichService` (`isbn-enrich`) + `lookupIsbnByTitle`; mapper `isbn`;
    indeks wyszukiwarki `isbn`; przycisk „Rytuał Sygnatur (ISBN)".
  - **PR3 — frontend skanu (mobile)** — ✅ ZREALIZOWANE (1.51.0). Przycisk skanu (gdy `scanSupported()`),
    `ScanModal` (`BarcodeDetector` + fallback ręczny), `src/utils/barcode.ts`; w `SearchSection` exact-match
    po `isbn` (B) → tytuł, else `GET /api/isbn/:code` (A) → tytuł, banery wyniku.
  - **ZASTRZEŻENIA / ODŁOŻONE**: (a) iOS Safari NIE ma natywnego `BarcodeDetector` — fallback `@zxing/browser`
    odłożony (v1 = Android/Chrome). (b) multi-edition ISBN — ✅ ROZWIĄZANE (1.52.0): zapisujemy WSZYSTKIE
    ISBN-y wydań (`isbns: string[]`), więc barcode dowolnej edycji trafia w wiersz (use case = „mam tę
    książkę", nie „tę edycję").
  - **DO ZROBIENIA: zawężenie enrichmentu (pollution ISBN) U ŹRÓDŁA.** Objaw ZAŁAGODZONY w 1.55.0
    (`prioritizeIsbns`: polskie na początek + cap 40 + auto-cleanup), ale nadal ŚCIĄGAMY dziesiątki obcych
    wydań (generyczne tytuły przez title-only fallback + 3 źródła × 2 tytuły × 20 wyników; realne przypadki
    72 i 130+ ISBN-ów). Ryzyko szczątkowe: FAŁSZYWE trafienia skanu. Kandydaci: wymagać zgodności autora w
    wynikach (Google `inauthor`/OL `author_name`/BN autor), NIE robić title-only fallback dla krótkich/
    generycznych tytułów, ewentualnie przechowywać TYLKO polskie (978-83). Do przemyślenia z użytkownikiem.
  - **DO ZROBIENIA (odłożone, decyzja użytkownika „narazie nie robimy"): OCR cyfr ISBN z kamery.** Dziś skaner
    czyta TYLKO kod kreskowy (`BarcodeDetector` → cyfry z pasków EAN-13); wydrukowanego numeru ISBN wzrokowo
    NIE odczyta (to OCR). Alternatywa dla cyfr JUŻ jest: pole „wpisz ISBN ręcznie" w oknie skanera
    (`inputMode=numeric`). Gdyby kiedyś dodawać OCR („nakieruj na numer"): `TextDetector` praktycznie martwy →
    trzeba biblioteki (np. Tesseract.js, ~kilka MB, wolniej), suma kontrolna ISBN do odfiltrowania błędów.
    Cięższy, osobny feature.

- **Vinted znowu zablokował skaner — alternatywy w zanadrzu** — NOTATKA (Vinted ubił skan z IP Render/datacenter).
  Co JUŻ mamy (obrona pasywna): throttle 3–5 s + jitter na każdej ścieżce, pula User-Agent (rotacja,
  konfigurowalna), keep-alive `https.Agent`, skan oldest-first + wznawialny (rozłożenie w czasie),
  obsługa 429/403 (403 = blok Cloudflare). To nie wystarcza, gdy Cloudflare flaguje samo IP datacenter.
  Alternatywy w kolejności koszt/skuteczność:
  1. **Priming ciasteczka Cloudflare** — ✅ ZREALIZOWANE (1.47.0). GET strony głównej Vinted przed skanem
     (i przed resolve sprzedawców) → przejęcie `Set-Cookie` (`cf_clearance` + sesja anon Vinted), niesione
     w `Cookie` + STAŁY UA na kolejnych żądaniach. Knob `vinted.primeSession` (default on). Jeśli okaże się
     niewystarczające → pkt 2.
  2. **Headless browser (Playwright)** — ✅ ZREALIZOWANE (1.48.0, wariant lekki: cookie).
     `services/browserPrime.ts`: headless Chromium (`playwright-core`, optionalDependency, dynamic import)
     wchodzi na stronę główną, wyzwanie JS Cloudflare się wykonuje, zbieramy `cf_clearance` + UA do
     `VintedSession`, dalej lekki axios. Knob `vinted.primeWithBrowser` (default off) + checkbox w Kalibracji.
     Best-effort: brak przeglądarki/`playwright-core`/błąd/brak clearance → fallback do lekkiego primingu →
     skan bez sesji. Wymaga Chromium po stronie backendu (`VINTED_CHROMIUM_PATH` / `PLAYWRIGHT_BROWSERS_PATH`);
     respektuje `HTTPS_PROXY`. NIE zwalidowane na żywo w sandboxie (proxy blokuje tunel CONNECT do Vinted) —
     do sprawdzenia u użytkownika (lokalnie). ZASTRZEŻENIE: `cf_clearance` wiąże się z fingerprintem TLS/JA3,
     więc ciasteczko z przeglądarki może być odrzucone przez gołe axios — wtedy samonaprawa katalogu porzuca
     sesję (może pomóc, nigdy nie zaszkodzi). Jeśli mało → wariant ciężki: cały scrape przez przeglądarkę
     (wolniej, więcej RAM — uwaga na OOM 512 MB Render).
  3. **Wewnętrzne API katalogu** (`/api/v2/catalog/items`, JSON) — dużo mniej pamięci niż 7 MB HTML +
     stabilniejszy parsing, ale wymaga tokenu/cookie z sesji i też pod Cloudflare. Wcześniej odrzucone DLA
     SPRZEDAWCY („brak wjazdu"), lecz z primingiem (pkt 1) warto przetestować dla katalogu.
  4. **Zmiana IP**: (a) proxy rezydencjalne / rotacja (płatne, najskuteczniejsze — omija flagę datacenter);
     (b) uruchamiać skan z innego miejsca niż Render (lokalnie / domowe IP), a do Notion pisać wynik.
  5. **Zewnętrzny scraping-API** (ScraperAPI / ZenRows / BrightData) — oddaje anty-bota dostawcy; koszt +
     zależność, ale zero utrzymania anty-Cloudflare po naszej stronie.
  6. **Podkręcić obronę pasywną** (najtańsze od razu): dłuższy throttle + rozłożyć skan na więcej dni
     (knob), mniejsze batche — kupuje czas, nie rozwiązuje twardego bloku IP.
  REKOMENDACJA: pkt 1 ZROBIONY (1.47.0) → obserwować, czy blok ustępuje; jeśli nie, pkt 2 lekki
  (Playwright tylko do cookie — realny challenge-solve, nie tylko puste GET).

- **Data przeczytania + „Tempo czytania" (velocity)** — ZREALIZOWANE (RD-PR1..4, 1.69.0–1.72.0): kolumna +
  mapper + ścieżka zapisu (stempel na „Przeczytane"), jednorazowy import historii z CSV (skrypt), agregacja
  `computeReadingStats` (przeczytane award-booki wg ROKU) i karta „Tempo czytania" na statystykach (KPI w tym roku
  + delta, tempo książek/rok, histogram roczny). Granularność ROCZNA (daty rok-only = 1 stycznia, więc bez
  rozbicia miesięcznego). **OPCJONALNIE później**: prognoza domknięcia kolekcji (recentPace + brakujące
  award-booki), streaki, surfacing daty przeczytania na karcie książki/regale.
- **Import dat przeczytania z CSV — feature w aplikacji (przyszłość).** Jednorazowy import zrobiony skryptem
  `scripts/importReadDates.ts` (RD-PR2, 1.70.0) na bazie czystych helperów `services/readDateImport.ts`
  (`parseReadDate`/`parseImportCsv`/`buildReadDatePlan`). DO ZROBIENIA kiedyś: opakować to w UI (upload CSV w
  Ustawieniach → podgląd planu: dopasowane/niedopasowane/niejednoznaczne → zatwierdź zapis), reużywając tych
  helperów. Nowe rekordy „na bieżąco" już obsłużone automatycznym stemplowaniem przy oznaczaniu „Przeczytane".
- **SECURITY SWEEP (2026-08-28) — findingi [1]–[6] i [8]-CSP ZREALIZOWANE (1.75.0–1.79.0, PR #349, #351, #353,
  #355, #357, #359, #361). OTWARTE: [7] TLS na OPAC (świadomie odłożone) + reszta drobiazgów z [8].** Pełny audyt (4 obszary:
  HTTP/auth, sekrety, scrapery, frontend). **Basic Auth JEST włączony na produkcji (potwierdzone przez usera)** —
  to przelicza wagi: findingi wymagające dostępu do API schodzą na dalszy plan, a na czoło wychodzą te, których
  auth NIE zasłania. Raport: `docs/security-sweep.md` (jeśli powstanie) / artifact z sesji.
  - **[1] SSRF w resolve sprzedawców — ✅ NAPRAWIONE (1.75.0, PR #349).** `services/vintedUrl.ts`
    (`isVintedUrl`/`isVintedPhotoUrl`: allow-lista hostów `vinted.pl` (+ `vinted.net` dla zdjęć) i schematu
    http/s, dopasowanie po sufiksie kropkowym) + `sanitizeStoredOffer` w `vintedStore.ts` (zły `url` → oferta
    odrzucona, złe `photo`/`seller` → pole ucinane) filtrujące oferty NA WYJŚCIU z bloba, a re-fetch w
    `vintedSyncService.ts` sprawdza host zamiast podciągu. Zamknęło też 6 sinków `href` w UI.
    ORYGINALNY OPIS: `vintedSyncService.ts:271`
    filtruje `/\/items\//.test(o.url)` = test PODCIĄGU, nie hosta; `parseVintedData` (`vintedStore.ts:113-118`)
    przepuszcza `offers` hurtem (choć `scannedAt`/`changedAt` typuje); `vintedParser.ts:204` przyjmuje dowolny
    absolutny `http…` ze scrapowanego JSON-a; nagłówki dokładają `Cookie` bez sprawdzenia hosta. Wektor wchodzi
    przez SCRAPOWANĄ TREŚĆ (nie przez API), więc autoryzacja nie stanowi bariery. Fix: allow-lista hosta+schematu
    w `parseVintedData` — zamyka też 6 sinków `href` w UI (ten sam root cause).
  - **[2] CSRF — ✅ NAPRAWIONE (1.76.0, PR #351).** `middleware/sameOrigin.ts`: dla metod mutujących host z
    `Origin` (fallback `Referer`) musi się zgadzać z `req.headers.host`, inaczej 403. Brak obu nagłówków →
    `next()` (świadome przejście dla CLI/curl — przeglądarka zawsze wysyła `Origin` przy cross-site POST).
    ORYGINALNY OPIS: Poświadczenia Basic są dołączane
    przez przeglądarkę do żądań cross-site; bezparametrowe rytuały (`/api/sync-purify`, `/api/sync/stop`,
    `/api/sync/reset`, `syncController.ts:183-197`) da się odpalić formularzem z obcej strony. Endpointy z ciałem
    JSON są bezpieczne (formularz cross-site nie wyśle `application/json`). Fix: check `Origin`/`Referer`.
  - **[3] Destrukcyjny zapis schematu — ✅ NAPRAWIONE (1.76.1, PR #353).** `syncController.ts` waliduje teraz
    payload wobec ŻYWEGO schematu Notion: kolumna musi istnieć, typ się zgadzać, a jedno wywołanie może usunąć
    NAJWYŻEJ jedną opcję. (Świadomie NIE „odrzucaj pustej listy" — UI kasuje opcje po jednej, więc usunięcie
    ostatniej legalnie daje `[]`; liczymy usunięcia, nie rozmiar.) ORYGINALNY OPIS: Walidacja przepuszcza `newOptions: []`
    (`syncController.ts:126-131`), a `updateSchema` (`notion.adapter.ts:101-106`) PODMIENIA opcje w całości →
    `PATCH` z pustą listą na `Źródło` czyści tagi w całej kolekcji, nieodwracalnie. Za authem = ryzyko własnej
    pomyłki/buga, nie obcego. Fix: odrzuć pustą listę + allow-lista edytowalnych kolumn.
  - **[4] Auth fail-open — ✅ NAPRAWIONE (1.77.0, PR #355).** `basicAuth.ts` przy `NODE_ENV=production` bez
    skonfigurowanych poświadczeń zwraca 503 (zamiast wpuszczać), chyba że świadomie ustawiono
    `ALLOW_PUBLIC_ACCESS=true`; `/api/health` zawsze przechodzi (health-check platformy).
    ORYGINALNY OPIS: `basicAuth.ts:29` `if (!user || !pass) return next()`, a
    `render.yaml` ma `sync: false` → świeży deploy z blueprintu wstaje OTWARTY. Dziś OK, ale jedna pomyłka przy
    rotacji zmiennych = cicha ekspozycja. Fix: fail-closed w `NODE_ENV=production`.
  - **[5] `dist/server.cjs` serwowany publicznie — ✅ NAPRAWIONE (1.77.1, PR #357).** `vite.config.ts` buduje SPA
    do `dist/public/` (+`emptyOutDir`), a `server.ts` serwuje statykę WYŁĄCZNIE z `dist/public`; bundle serwera
    zostaje poza rootem statycznym. Zweryfikowane po treści odpowiedzi (nie po statusie): `GET /server.cjs` →
    fallback SPA, zero śladów backendu. ORYGINALNY OPIS: (`server.ts:30-32` — build wrzuca SPA i bundle serwera do tego
    samego `dist/`). Za authem to non-issue; sprawdzone: ZERO zaszytych poświadczeń w bundlu. Fix przy okazji:
    build SPA do `dist/public/`.
  - **[6] Limity zasobów — ✅ NAPRAWIONE (1.79.0, PR #361).** `services/boundedCache.ts` (`BoundedCache`, FIFO z
    twardym capem; `null` jest legalną wartością → obecność przez `has()`) zastąpił gołe `Map` w
    `cycleLookupService` i `isbnLookupService`; `scrapingClient.ts` eksportuje `responseSizeLimit`
    (`maxContentLength`/`maxBodyLength` = 12 MB) dopięty do wszystkich wywołań axios w scraperach.
    ORYGINALNY OPIS: nielimitowane `Map` cache (`cycleLookupService.ts:55`, `isbnLookupService.ts:28`) bez
    TTL/capa; brak `maxContentLength` na wszystkich axiosach (przy 7 MB stronach Vinted i 512 MB Rendera);
    `/api/cycle` robi do ~34 żądań wychodzących na chybienie. Za authem = tylko własny footgun/wyciek pamięci.
  - **[7] TLS wyłączony na OPAC — ⏸️ OTWARTE, ŚWIADOMIE ODŁOŻONE.** (`libraryCheckService.ts:45-48`,
    `rejectUnauthorized:false`) — auth nieistotny, to warstwa sieciowa. Kontrolowane (per-agent, bez poświadczeń),
    ale odpowiedzi decydują o zapisach do Notion. Węższy fix: dopiąć brakujący cert przez `ca:`. POWÓD ODŁOŻENIA:
    nie da się tego zmienić „na ślepo" — trzeba najpierw pobrać i obejrzeć realny łańcuch certyfikatów OPAC-a
    (sandbox tego nie dosięga), a zła zmiana ubija działający rytuał biblioteczny.
  - **[8] Drobne — CSP ✅ ZROBIONE (1.78.0, PR #359)**: `middleware/securityHeaders.ts` (CSP z `frame-ancestors
    'none'`, `object-src 'none'`, `img-src` ograniczony do self/data/vinted, `connect-src 'self'`) + `nosniff` +
    `X-Frame-Options: DENY` + `Referrer-Policy: same-origin`; zweryfikowane realnym Chromium/Playwright (0
    naruszeń, React montuje się poprawnie). RESZTA OTWARTA: ciasteczka Vinted spłaszczane bez
    scope’u hosta (`cookies.ts` + `browserPrime.ts:73` bierze WSZYSTKIE ciasteczka kontekstu), `error.message`
    z upstreamu zwracany dosłownie (leak ID bazy w komunikacie Notion), `nanoid` w npm audit (build-time only).
  - **ZWERYFIKOWANE JAKO CZYSTE** (nie powtarzać audytu): zero XSS (brak jakiegokolwiek sinka HTML w `src/`),
    zero sekretów w drzewie i w 286 commitach historii, klucz Notion nigdy nie logowany/nie zwracany/nie w bundlu,
    `mergeConfig` wzorowy (neutralizuje też prototype pollution), Basic Auth poprawny (`timingSafeEqual`, montowany
    przed `express.json()` i statykiem), brak SSRF w warstwie HTTP/path traversal/SQL/shell injection, brak ReDoS,
    lock zadań bez TOCTOU, keepalive SSE sprzątane, Playwright nie odwiedza niezaufanych URL-i.
- **Prognoza domknięcia kolekcji (reading velocity, dalszy ciąg)** — DO ZROBIENIA. Na bazie `readingStats`
  (`recentPace`) + liczby brakujących (nieprzeczytanych) award-booków policzyć szacunek „przy obecnym tempie
  domkniesz kolekcję ~za X (lat/mies.), ok. rok YYYY". Miejsce: `computeReadingStats` (dołożyć pole `forecast`)
  albo osobna agregacja; render w `ReadingPaceCard` (kafel/pasek). Uwaga na tempo=0 (brak danych z ukończonych
  lat) → „za mało danych". Ewentualnie także: streaki, surfacing daty przeczytania na karcie książki/regale.
- (brak) — pipeline persystencji Vinted (ETAP 1–3) kompletny.
- **Ewentualnie później**: odświeżanie pojedynczej książki/oferty z bazy (re-check
  świeżości), natywna baza „Vinted Offers" (jeśli blob przestanie wystarczać), proxy
  rezydencjalne dla ominięcia 403.
- **Cykle: struktura + sąsiednie tomy + dostępność Vinted — ZREALIZOWANE jako REALNE WIERSZE bazy.**
  Bloby (`CycleData`/`CycleCache`) i „widma" PORZUCONE — wybrano wariant „realne wiersze" (dawny wariant B).
  Aktualny model: podgląd on-demand `GET /api/cycle` (Katalog + kafelki Vinted); tomy cykli materializowane
  Rytuałem Żniw jako wiersze `Kategoria="Tom cyklu"` (+ `Cykl`/`CyklNr`); karta „Archiwum Cykli" agreguje je
  (`aggregateCycleRows`). **UC1 (dostępność brakujących tomów na Vinted) tym samym ZREALIZOWANE za darmo**:
  skoro tomy to wiersze z pustym `Źródło`, normalny skaner Vinted zbiera ich oferty, a karta pokazuje
  `acquireCost` + pill „🛒 X zł" per tom — bez osobnego skanu widm i bez blobów. Szczegóły: `docs/cycles-rows.md`.
  Jedyne residuum (opcjonalne): tom z łańcucha wiki, którego Żniwa nie zmaterializowały (urwanie MAX_HOPS /
  nieudany sąsiad) nie ma wiersza → brak dostępności; fix = poprawić POKRYCIE Żniw, nie osobny mechanizm.

## Zrobione (skrót)

- **Seller bundling** (1.1.0) — ZROBIONE. Opcja A (parsowanie strony oferty), on-demand.
  Sprzedawca ze strony `/items/{id}` (markery zweryfikowane: `href="/member/{id}"` +
  `data-testid="profile-username"`, oba unikalne 1×). Grupujemy najtańszą/książkę (1
  fetch/książkę — mniej ekspozycji na Cloudflare). Opcja B (wewn. API) odpadła — brak wjazdu.
