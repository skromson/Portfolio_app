# Folio — portfel XTB z notowaniami online

Import raportów Excel XTB, konta PLN/EUR/USD/IKE w dowolnej kombinacji, aktualna wycena pozycji, historia wartości z cenami akcji i historycznym FX, wynik procentowy po korekcie wpłat, wpłaty/wypłaty, dywidendy, profile spółek i eksport CSV operacji.

## Aktualizacja istniejącej instalacji

W terminalu otwartym w katalogu `Portfolio_app` zatrzymaj aplikację przez `Ctrl+C`, a następnie:

```sh
git pull --ff-only origin main
npm ci
npm run dev
```

Otwórz w przeglądarce lokalny adres podany w terminalu (domyślnie port 5173). Terminal musi pozostać otwarty. Dane zaimportowane w tej samej przeglądarce i pod tym samym adresem pozostają w pamięci. Nie trzeba ponownie importować raportów, chyba że pojawiły się nowe transakcje.

## Pierwsze uruchomienie

Zainstaluj Node.js 24 LTS (z npm) oraz Git. Minimalny obsługiwany Node: 22.12; sprawdzono na 24.19.

```sh
git clone https://github.com/skromson/Portfolio_app.git
cd Portfolio_app
npm ci
npm run dev
```

W aplikacji wybierz **Importuj raport** i dodaj pełne eksporty XTB. Domyślny tryb **Notowania online** pobierze ceny i FX bez klucza API. Pierwsze pobranie pełnej historii kilkudziesięciu instrumentów może zająć kilkadziesiąt sekund. Odświeżanie następuje automatycznie co 60 sekund po zakończeniu poprzedniego pobrania; można też użyć przycisku odświeżania.

Jeden proces Node obsługuje frontend i endpoint `/api/market`. **Nie uruchamiaj samego `npx vite`** — bez serwera nie działają notowania. Zmiana plików backendu w `server/` wymaga restartu; frontend zachowuje Vite HMR. Domyślnie serwer słucha tylko lokalnie. `PORT` zmienia port; `HOST=0.0.0.0` pozwala na dostęp z sieci, jeśli użytkownik tego potrzebuje.

### Wersja produkcyjna

```sh
npm run build
npm start
```

`npm start` udostępnia `dist` i API z jednego procesu. Sam hosting statyczny (np. GitHub Pages) nie wystarcza do obsługi API. GitHub przechowuje kod; push nie publikuje aplikacji. Nie należy wystawiać tego osobistego serwera publicznie bez dodatkowej kontroli dostępu i limitów. `npm run preview` jest aliasem tego samego serwera produkcyjnego.

## Źródło danych i ich aktualność

- Yahoo Finance chart API — bieżące ostatnie ceny i dzienne ceny zamknięcia. **Nie gwarantujemy strumienia giełdowego w czasie rzeczywistym**: dane mogą być opóźnione, a po zamknięciu rynku ostatnia cena pozostaje bez zmian. Interwał odświeżania aplikacji nie oznacza świeżego ticka giełdowego. Tabela pokazuje czas ceny, walutę i giełdę; ustawienia pokazują czasy FX.
- FX jest liczony z notowań par walutowych Yahoo: USD/PLN i USD/waluta. Przykład: PLN za EUR = USD/PLN ÷ USD/EUR. Ten sam mechanizm działa dla SEK, GBP itd. Historia używa dziennych kursów, a wycena bieżąca — ostatnich cen obu nóg. To rynkowe kursy referencyjne, nie kursy kupna/sprzedaży XTB lub banku.
- Serwer obsługuje HTTPS proxy z `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` przez `undici`. Weryfikacja TLS pozostaje włączona. W sieci z filtrowaniem wymagane domeny: `query1.finance.yahoo.com`, `query2.finance.yahoo.com`.
- Yahoo może zwracać limity lub przerwy w dostępności; nie jest to usługa z gwarancją dostępności. Przy awarii odświeżenia widoczne są ostatnie udane dane oraz komunikat błędu. Gdy brakuje ceny/FX potrzebnej do aktualnej wyceny, nie pokazujemy fałszywej sumy ani zera. Można wybrać tryb raportu. Brakujące ceny historyczne tworzą luki w wykresie, bez użycia przyszłych notowań.
- Odpowiedzi ostatnich notowań są buforowane 30 sekund, historia 6 godzin. Instrumenty już zamknięte nie wymagają pobierania bieżącej ceny co minutę. Historia jest odświeżana wcześniej po wykryciu nowego splitu. Limit pojedynczego zapytania to 100 instrumentów.

### Mapowanie tickerów

Domyślnie `.US` znika, `.PL` → `.WA`, `.SE` → `.ST`, `.UK` → `.L`. `.DE` pozostaje `.DE`. Zweryfikowane wyjątki:

| XTB      | Yahoo  | Uwagi                                                                |
| -------- | ------ | -------------------------------------------------------------------- |
| GOOGC.US | GOOG   | Alphabet, akcje klasy C                                              |
| AMZN.DE  | AMZ.DE | Amazon w EUR                                                         |
| HY9H.DE  | HY9H.F | SK hynix, Frankfurt zamiast Xetra; różna giełda może dawać inną cenę |

W **Ustawienia → Symbole notowań online** można zmienić mapowanie. Weryfikuj nazwę, walutę, giełdę i tożsamość instrumentu, zwłaszcza ADR/GDR i różne notowania tej samej spółki. Zmiana mapowania jest zapisywana lokalnie. Nie zastępuj GDR zwykłą akcją bez uwzględnienia jej przelicznika.

## Jak liczymy portfel

- Bieżąca wycena: liczba jednostek z ostatniego raportu × cena w walucie notowania × kurs do waluty widoku, plus saldo gotówki. Waluta spółki może różnić się od waluty konta (np. SIVE.SE jest notowane w SEK, mimo konta EUR).
- Koszt otwartych pozycji jest przeliczany do waluty widoku kursem z dnia zakupu każdej partii. Wynik obejmuje więc cenę i FX od zakupu. Wartości są szacunkiem na podstawie publicznych danych, a nie saldem rozliczeniowym brokera.
- Historia obejmuje gotówkę oraz partie aktywne na koniec każdego dnia. Używa historycznej ceny zamknięcia i FX z tego dnia; w weekendy przenosi ostatnią wcześniejszą cenę. Dzisiejszy punkt korzysta z ostatnich notowań. Historyczne dni i operacje są łączone w dziennym kalendarzu UTC; sesje giełdowe mają datę lokalnej giełdy. Nie jest to wykres intraday.
- Po dacie raportu zakładamy utrzymanie pozycji i salda. **Aplikacja nie łączy się z kontem XTB i nie zna nowych transakcji**, dopóki nie wgrasz nowszego pełnego raportu.
- Wykres procentowy jest łańcuchowany dziennie: `Vkoniec / (Vpoczątek + przepływ)`. Zakłada przepływy na początku dnia; nie jest dokładnym intraday TWR ani IRR. Zmiana okresu przelicza wynik od pierwszego punktu wybranego zakresu. Wpłaty/transfery nie są traktowane jako zysk. Przerwa w wycenie przerywa wynik procentowy od początku zakresu — można wybrać krótszy okres po luce.
- Dywidendy i podatki pochodzą z rzeczywistych operacji gotówkowych. Nie używamy cen skorygowanych o dywidendy, aby nie liczyć ich podwójnie. Yahoo dostarcza ceny skorygowane o splity; ilość partii jest normalizowana z daty raportu lub daty zamknięcia do bieżącej bazy akcji. Złożone zdarzenia korporacyjne, fuzje i transfery papierów mogą wymagać osobnej korekty danych.
- Profile spółek są opisami ogólnymi, bez aktualnych wskaźników finansowych i rekomendacji.

W sprawdzonych lokalnych raportach źródło miało pełne notowania dla bieżących pozycji i 439 z 441 dni historii; dla S2B brakowało cen z 14 i 15 kwietnia 2026. Luki pozostają oznaczone. Dostępność notowań może się zmieniać.

## Import i prywatność

Pełny eksport XTB `.xlsx` (maks. 10 MB na plik) musi zawierać angielskie arkusze `Closed Positions`, `Cash Operations`, `Open Positions` i obejmować całą historię konta, ponieważ saldo początkowe przyjmujemy jako zero. Obsługiwane konta: PLN, EUR, USD i IKE; długie pozycje akcyjne i ETF. CFD i pozycje krótkie są odrzucane. Dla IKE zachowaj prefiks `IKE_` w nazwie pliku.

Ponowny import zastępuje raport tego konta; starszy raport nie zastępuje nowszego. Raporty częściowe nie są scalane. Pozycje zbiorcze i szczegółowe partie nie są liczone podwójnie. Rozbieżność numerów kont między arkuszami powoduje ostrzeżenie.

Pliki, numery kont, ilości akcji i salda pozostają w przeglądarce (`localStorage`, `folio-v1`). Serwer otrzymuje **wyłącznie listę tickerów, aktywnych tickerów, opcjonalne mapowanie symboli oraz początkową datę historii**. Do Yahoo trafiają symbole i zakres dat, bez danych kont i wartości transakcji. LocalStorage nie jest szyfrowanym sejfem. Konta można usunąć w ustawieniach.

Cztery oryginalne załączniki, jeśli dostępne w tej instancji, leżą w ignorowanym `public/local-reports/`. **Nie są wysyłane do GitHub ani kopiowane do `dist`** (`copyPublicDir: false`). Na swoim komputerze użyj przycisku importu własnych plików. Nie publikuj ręcznie katalogu `public/local-reports`.

### Tryby awaryjne

**Raport / koszt historyczny** pokazuje snapshot raportu i historię kosztu pozycji plus gotówkę. Używa stałych, ręcznych lub wywnioskowanych z raportów kursów FX; nie zastępuje wyceny online. Procent w tym trybie to wskaźnik `(kapitał kosztowy − wpływy netto) / dodatnie przepływy`, nie rynkowa stopa zwrotu.

**Ceny CSV** przyjmuje plik `date,ticker,currency,price` (daty `RRRR-MM-DD`, także separator `;`). Ceny muszą być już w walucie konta. Również używa stałych FX, a nie historycznego FX online. Kursy ręczne i CSV pozostają w bieżącej sesji i nie nadpisują źródeł online.

## Testowanie

```sh
npm test
npm run test:e2e
npm run build
```

Playwright używa systemowego `/usr/bin/chromium`, jeśli jest dostępny. Na własnym komputerze zainstaluj przeglądarkę: `npx playwright install chromium`. Można też wskazać `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

Testy modelu sprawdzają historyczne FX, cenę w innej walucie niż konto, przepływy, zamknięcia, splity, brak użycia przyszłych cen, pokrycie danych, parser XTB i daty CSV. Testy dostawcy sprawdzają normalizację pensów, błędy, mapowanie symboli, cache i drugi host. Testy przeglądarkowe z kontrolowanymi odpowiedziami API sprawdzają automatyczny refresh, aktualizację wyceny, zmianę waluty, awarię i prywatność żądania. Testy oryginalnych załączników uruchamiają się tylko, gdy lokalne pliki są dostępne. Publiczne repozytorium nie zawiera numerów kont ani sald użytkownika.

W środowisku chmurowym katalog projektu to `/workspace/Portfolio_app`; w razie ograniczeń cache użyj `npm ci --cache /tmp/folio-npm-cache`. Proces serwera wymaga ponownego uruchomienia po odtworzeniu środowiska. Parser ExcelJS ładowany jest dopiero przy imporcie. Jego starsze zależności mogą wyświetlać ostrzeżenia `deprecated`; nie używaj automatycznie `npm audit fix --force`.
