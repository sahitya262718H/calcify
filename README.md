# CalciFy

Build calculators from your own formulas, reuse them in seconds, and share them with the community.

- Write a formula once, like `(NumberOfPeople x Cost x Days) + AutoCharge - Cuttings`
- CalciFy finds the inputs automatically and builds the form
- Next time, open the calculator and enter only the values
- Private by default. Publish one when you want others to use, rate, review and fork it
- 10 ready-made calculators (EMI, SIP, GST, BMI, interest, discount and more)

## How it works

```
public/                  Static frontend (HTML, CSS, vanilla JS modules — no build step)
  js/engine.js           Formula engine: tokenizer → Shunting Yard → AST → safe evaluator (no eval)
  js/core.js             The whole backend logic (auth, calculators, reviews, stars, forks)
  js/api.js              Browser client. Falls back to a "this device" mode if no server is found
  js/about.js            ✏️ Edit this to change the About page
netlify/functions/api.mjs  Netlify Function that serves /api/* using core.js + Netlify Blobs
dev-server.mjs           Local server (no Netlify account needed)
tests/                   Engine tests, API tests, browser end-to-end test
```

Data is stored in **Netlify Blobs**, which is built into every Netlify site. No database account or setup is needed.

Passwords are hashed with PBKDF2-SHA256 (120k iterations). Logins use signed tokens (HMAC-SHA256) that last 30 days.

## Formula syntax

| You write | Meaning |
|---|---|
| `Price * Qty` | Any word becomes an input (letters, numbers, `_`) |
| `[Auto Charge]` | Square brackets let you use spaces in a name |
| `a x b`, `a * b`, `a × b`, `5x3` | Multiply |
| `+ - / ^ ( )` | Add, subtract, divide, power, grouping |
| `Amount * 18%` | `%` after a value divides it by 100 |
| `if(Sales > 10000, Sales * 5%, 0)` | Conditions: `> < >= <= == !=` |
| `round(x, 2)`, `floor`, `ceil`, `abs`, `sqrt`, `min`, `max`, `avg`, `sum`, `pow`, `mod`, `log`, `ln`, `exp`, `sin`, `cos`, `tan`, `pi` | Functions |

Input boxes also accept simple maths, so typing `250*3` in a box uses 750.

## Run it locally

**Windows, easiest:** double-click `start-calcify.bat`. It uses your Node.js, or downloads a portable copy into `.runtime` the first time if you don't have one, then opens http://localhost:8888 in your browser.

**VS Code / IntelliJ:** open the folder and run `dev-server.mjs` (in VS Code, press F5 and pick "Run CalciFy").

**Terminal** (needs Node.js 18 or newer):

```bash
node dev-server.mjs        # then open http://localhost:8888
npm test                   # engine + API tests
```

Local data is saved in `.data/db.json`.

## Deploy to Netlify

**Important:** don't use Netlify's drag-and-drop deploy. It only uploads static files, so the backend (login, saving, Explore) won't run. Use one of these two ways.

### Option A: GitHub + Netlify (recommended)

1. Create a new repository on GitHub and upload this folder to it.
2. On [app.netlify.com](https://app.netlify.com), click **Add new site → Import an existing project → GitHub** and pick the repository.
3. Leave all the settings as they are (they come from `netlify.toml`) and click **Deploy**.
4. Every time you push to GitHub, Netlify redeploys automatically.

### Option B: Netlify CLI from your computer

```bash
npm install -g netlify-cli
cd calcify
npm install
netlify login              # opens the browser once
netlify init               # create a new site (or `netlify link` for an existing one)
netlify deploy --prod
```

### Optional: a fixed signing secret

CalciFy creates a login-signing secret on its own and stores it in Blobs. If you'd rather set it yourself, go to **Site configuration → Environment variables** and add `CALCIFY_SECRET` with a long random value. Changing it logs everyone out.

## Notes

- The netlify.toml build command runs `npm test`, so a broken formula engine never gets deployed.
- If the page can't reach `/api` (for example, when opened as a plain static file), it switches to **this-device mode**. Everything still works, but data is stored only in that browser, and a banner says so.
