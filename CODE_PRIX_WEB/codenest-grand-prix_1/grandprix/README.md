# CodeNest Grand Prix

A browser typing race where you out-type adaptive AI rivals and your own best
lap. It is plain HTML/CSS/JS — no build step, no dependencies, no framework.

## Files

```
index.html    the page structure
styles.css    all visual styling (violet/cyan/pink night-track palette)
script.js     game logic — cars, AI pacing, typing detection, countdown, results
```

Everything runs client-side. There is no backend and nothing to install.

## Run it locally

Just open `index.html` in a browser — or, for the most realistic test (some
browsers restrict things like localStorage on `file://` pages), serve it:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then visit the printed local URL.

## Deploy to Vercel

Pick whichever you're most comfortable with — all three work with **zero
configuration** since this is a static site.

**Option A — Vercel CLI**
```bash
npm i -g vercel      # once, if you don't have it
cd this-folder
vercel               # follow the prompts
vercel --prod        # promote to your production URL
```

**Option B — Drag and drop**
Go to https://vercel.com/new, and drag this folder onto the page. Vercel
detects it as a static project automatically.

**Option C — GitHub**
Push this folder to a new GitHub repo, then "Import Project" on Vercel and
point it at the repo. Every push redeploys automatically.

No `vercel.json`, no `package.json`, no build command needed — Vercel serves
`index.html` and its neighboring files as-is.

## How the game works

- Choose **Prose** or **Code** mode and a short, medium, or long challenge.
  Code mode includes punctuation, brackets, indentation, and new lines.
- Type the highlighted text exactly, character by character. Correct keys are
  colored in; a wrong key flashes red and breaks your streak (Backspace
  removes your last character and gets you back on track).
- Every 5-key clean streak fills your **Nitro Flow** bar a little more; it
  slowly drains over time and drops sharply on a mistake.
- Three AI cars adapt to your rolling five-race WPM, keeping close races
  competitive as you improve.
- The fastest completed lap for each mode/difficulty becomes a translucent
  **BEST LAP** ghost car. Beat your past self to replace it.
- Your placement is decided the moment you finish the paragraph (or once
  every rival has crossed the line, whichever comes first).
- Sound has a visible mute switch in the top bar. Escape pauses the race and
  asks for confirmation before abandoning it.
- Screen readers receive race-state, countdown, position, and finish updates
  through a live region. Cars use both names and distinct shape icons, so the
  game is not dependent on colour alone.
- Mobile text capture uses the browser `input` event (rather than relying
  only on `keydown`) to better support virtual keyboards, predictive text and
  IME input. A final QA pass on the actual phones/tablets you support is still
  recommended before launch.
- Speed (WPM), Precision (accuracy), Streak, finish telemetry, rolling skill
  data, and best laps are stored locally in the browser via `localStorage`.

## Customizing

- **Text prompts** — edit the `PARAGRAPHS` array near the top of `script.js`.
- **Colors** — every color is a CSS variable at the top of `styles.css`
  (`--cyan`, `--violet`, `--pink`, etc.) — change once, updates everywhere.
- **AI difficulty** — adjust the speed ranges in `resetRace()` in `script.js`
  (search for `makeCar('BYTE FOX'`).
- **Sound** — all sound effects are synthesized in-browser (Web Audio
  oscillators), so there are no audio files to swap — tweak frequencies in
  the `sfx()` function if you want a different feel.
