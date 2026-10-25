# Folio — portfel XTB

Lokalna aplikacja React do analizy pełnych eksportów Excel XTB. Obsługuje PLN, EUR, USD i IKE, dowolny wybór kont, skład i udział aktywów, wynik otwartych pozycji, wpłaty/wypłaty, wymiany walut, dywidendy, historię operacji, eksport CSV i ogólne profile spółek.

## Uruchomienie

Zainstaluj **Node.js 24 LTS** (zawiera npm), a następnie otwórz terminal w katalogu, w którym chcesz zapisać projekt:

```sh
git clone https://github.com/skromson/Portfolio_app.git
cd Portfolio_app
npm ci
npm run dev
```

Otwórz w przeglądarce adres lokalny wyświetlony przez Vite w terminalu (domyślnie port 5173). Terminal musi pozostać otwarty. Zatrzymanie: `Ctrl+C`. W aplikacji wybierz „Importuj raport” i wskaż swoje pliki XTB. GitHub przechowuje kod; samo wysłanie repozytorium nie publikuje działającej strony.

Jeśli projekt jest już pobrany, pomiń `git clone` i przejdź do jego katalogu. Minimalna wersja Node to 22.12; sprawdzono 24.19. W środowisku chmurowym katalog projektu to `/workspace/Portfolio_app`; w razie ograniczeń zapisu cache użyj `npm ci --cache /tmp/folio-npm-cache`.

```sh
npm test
npm run build
npm run test:e2e
```

Testy przeglądarkowe używają systemowego `/usr/bin/chromium`, jeśli jest dostępny. Na własnym komputerze zainstaluj przeglądarkę poleceniem `npx playwright install chromium`. Możesz też wskazać plik wykonywalny przez zmienną `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Build statyczny trafia do `dist`; można go obsłużyć zwykłym serwerem HTTP. To aplikacja lokalna, bez backendu i bez integracji z kontem XTB.

## Import

Przycisk „Importuj raport” przyjmuje wiele plików `.xlsx` (do 10 MB na plik). Wymagane arkusze angielskiego eksportu XTB: `Closed Positions`, `Cash Operations`, `Open Positions`. Eksport powinien obejmować **całą historię konta**, ponieważ saldo początkowe wynosi zero. Sumy końcowe w arkuszach nie są transakcjami. Pozycje zbiorcze służą do składu portfela, a szczegółowe partie do historii — nie są liczone podwójnie.

Ponowny import tego samego numeru konta **zastępuje** raport. Starszy raport (według daty wygenerowania) nie zastępuje nowszego. Raporty częściowe nie są scalane. Produkt IKE rozpoznawany jest po operacjach i prefiksie `IKE_`. Rozbieżność numerów kont między arkuszami powoduje ostrzeżenie. Importer jest przeznaczony dla długich pozycji akcyjnych; CFD i pozycje krótkie nie są obsługiwane.

Przetworzone dane są zapisywane w `localStorage` pod kluczem `folio-v1`, bez wysyłania na serwer. To nie jest szyfrowany magazyn: inni użytkownicy tego samego profilu przeglądarki mogą mieć do nich dostęp. Konto można usunąć w ustawieniach. Pliki użytkownika nie są dołączone do śledzonych plików repozytorium.

W tej instancji cztery załączniki są dostępne przez przycisk „Wczytaj cztery załączone raporty”. Znajdują się w ignorowanym `public/local-reports/`; katalog jest tylko lokalnym ułatwieniem. **Build produkcyjny nie kopiuje katalogu `public`** (`copyPublicDir: false`), więc załączniki nie trafiają do `dist`. Nie publikuj ręcznie katalogu `public/local-reports`. W produkcji wybierz pliki ze swojego urządzenia; importer działa bez dołączonych załączników.

## Wycena i historia

* Wartość portfela to wycena otwartych pozycji **na datę raportu**, powiększona o saldo operacji gotówkowych. Nie jest bieżącym kursem rynkowym.
* Historia domyślna przedstawia gotówkę + koszt pozycji otwartych w danym dniu. Wykorzystuje partie otwarte i zamknięte; nie odtwarza brakujących notowań.
* Domyślny wykres procentowy to `(wartość kosztowa − wpływy netto) / suma dodatnich przepływów`. To wskaźnik kosztowy, **nie** rynkowa stopa zwrotu, TWR ani IRR.
* Transfery i wymiany to przepływy dla poszczególnych kont. Podsumowania wpływów i wypływów obejmują transfery wewnętrzne; nie oznaczają wyłącznie wpłat z banku.
* Waluty są przeliczane jednym stałym kursem do PLN, pobranym z ostatnich wymian w zaimportowanych raportach (różne daty), lub wpisanym ręcznie. Kursy można poprawić w ustawieniach. Bez potrzebnego kursu nie sumujemy nieporównywalnych walut. Historia nie obejmuje zmian FX. Ręczne kursy obowiązują w sesji.
* Różne daty raportów są oznaczane; wspólny widok łączy ostatnie dostępne stany, nie udaje zsynchronizowanej wyceny.
* Dywidendy podajemy brutto; podatki pozostają osobnymi operacjami.
* Profile spółek są lokalnymi opisami ogólnymi, bez aktualnych wskaźników, wyników finansowych czy rekomendacji.

### Rynkowa historia z notowań CSV

Ustawienia → „Wczytaj CSV z cenami”. Format:

```csv
date,ticker,currency,price
2026-10-23,MU.US,USD,877.10
```

To przykład formatu, nie automatyczny serwis notowań. `price` oznacza wartość jednej jednostki **w walucie konta**. Przykładowo szwedzka akcja na koncie EUR wymaga ceny jednostki przeliczonej na EUR, nie ceny w SEK. Obsługiwany także separator `;` z przecinkiem dziesiętnym. Powtórzenie klucza dzień/ticker/waluta nadpisuje poprzedni wiersz. Import zastępuje zestaw cen i pozostaje w bieżącej sesji.

Wykres rynkowy wycenia aktywne partie ostatnią dostępną ceną z dnia nie późniejszego niż punkt wykresu. Dni bez cen choć jednej pozycji mają przerwy; ceny starsze niż 7 dni powodują komunikat. Procentowa zmiana jest łańcuchowana dziennie: `Vkoniec / (Vpoczątek + przepływ)`, z konwencją przepływów na początku dnia; luka w danych przerywa obliczanie wyniku od początku. Kursy FX nadal są stałe. Do wiernej wyceny historycznej potrzebne byłyby kompletne skorygowane notowania i historyczne kursy FX; nie są one obecne w eksportach XTB.

## Weryfikacja

Testy modelu używają syntetycznego skoroszytu i sprawdzają salda, brak podwójnego liczenia, wymianę raportów, waluty, walidację CSV oraz brak użycia przyszłych cen. Gdy lokalne załączniki są dostępne, dodatkowy test porównuje wyniki parsera z podsumowaniami odczytanymi bezpośrednio z eksportów. Testy Playwright sprawdzają import, selekcję kont, nawigację, trwałość danych, brak duplikatów, błędny plik i układ mobilny.

Parser ExcelJS jest ładowany dopiero przy imporcie. Nadpisanie zależności `uuid` do wersji 11 usuwa znaną podatność starszej wersji; ExcelJS używa zgodnej funkcji `v4`.
