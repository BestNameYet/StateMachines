# Audio clip selector browser harness

This project tests the actual standalone listening page and all 81 embedded audio excerpts. The workflow reuses the Selenium Server/Chromium environment in `.github/workflows/selenium-server.yml`.

## Run

Actions → Audio clip selector tests → Run workflow. A push changing this folder or `.github/workflows/audio-clip-selector-test.yml` also runs the harness. No labels from a user's browser are read or modified: tests use a fresh Chromium profile on the GitHub runner.

## Coverage

- Exactly 81 unique recordings, checked against a separate manifest with audio SHA-256 hashes.
- One native, trusted label-button click for each of the 81 clips, alternating Main speaker and Other.
- At every click: the actual audio source, visible filename, active index, event-time clip identity, in-memory label, browser storage, counters, and complete expected label map agree.
- All 81 listening→buffer→next transitions, including no early transition during the two-second buffer and clean completion after clip 81.
- All 81 MP3 sources load and actually start playback in Chromium.
- CSV and JSON export contents, refresh persistence, backup restoration, invalid-backup rejection, filtering, search, clear, and next-unassigned navigation.
- Pause/resume during listening and buffer, replay, previous/next, an unanswered clip, label changes during buffer, keyboard labels, storage failures, and browser playback errors.
- A separate unmodified-clock check measures an actual 15-second listening window and at least two seconds between the pause and the next playback.

The exhaustive sweep uses a frozen, explicitly advanced test clock for application timing, while audio decoding/playback and label clicks remain real browser operations. Native audio time is not accelerated. The real-time check uses the production clock. The report separates these evidence types; it does not claim 81 complete excerpts played for their full lengths.

`test.cjs` instruments only the isolated test browser, not the delivered page. Label clicks go through WebDriver; the harness does not assign labels directly. Browser storage is cleared only inside that test session.

## Files and artifacts

- `listen_and_label.html`: production page, with audio embedded.
- `manifest.json`: independent filename/order/audio checksum expectations.
- `test.cjs`: browser test harness using the Selenium client installed by the shared workflow.
- `selenium-results/audio-selector-report.json`: structured stage results, 81 click records, timing evidence, and failures.
- `selenium-results/click-audit.csv`: one row for each exhaustive-sweep click.
- `selenium-results/exported-labels.csv` and `exported-backup.json`: browser-generated exports captured and checked by the harness.
- Screenshots, browser console logs, and final DOM where available.

The page is served locally inside the job at port 8080. The workflow installs dependencies only in `ChatMachines/SeleniumServer/`. Node 24 and FFmpeg-free browser playback are provided by the existing environment.
