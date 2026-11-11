# Website chat assistant (demo widget)

A floating chat button for any website. It answers customer questions from a per-business JSON file and ends enquiries with a button that opens WhatsApp with the message pre-written (`https://wa.me/<number>?text=...`).

- 100% static: HTML, CSS, vanilla JS. No build step, no backend, no API keys, no monthly server cost.
- Answers in English and Roman Urdu, tolerates small typos.
- Two fictional sample sites: `dental/` (Gulberg clinic) and `academy/` (Johar Town coaching).

## Preview locally

Config files are loaded with `fetch`, so open the folder through a static server (opening the file directly with `file://` will not load the config):

    cd demo-widget
    python -m http.server 8000

Then visit http://localhost:8000/ (pitch page), `/dental/`, `/academy/`, and `/tests.html` (matcher tests).

## Add a new business in 10 minutes

1. Copy a folder: `cp -r dental mybiz` (or copy just a config such as `dental/clinic.json`).
2. Edit the JSON (see fields below). Replace `whatsappNumber` with the real number in international format, digits only, no plus (Pakistan: `923001234567`), and set `"whatsappIsPlaceholder": false`.
3. Put this before `</body>` on the business page (path to `widget.js` and to the config as appropriate):

       <script src="widget.js" data-config="mybiz.json"></script>

4. Open the page, ask the chat the ten questions customers ask most, and add FAQs for any it misses.
5. Add rows for your new config in `tests.html` (`SUITES`) so you notice if an edit breaks something.

### Config fields

| Field | Meaning |
|---|---|
| `businessName`, `brandColor` | Header text and accent colour (hex). Text colour is chosen automatically. |
| `whatsappNumber`, `whatsappIsPlaceholder` | Number for wa.me; the flag shows a "placeholder" note. |
| `phoneDisplay`, `address`, `mapUrl` | Shown when asked about contact or location. |
| `hours` | List of `{days, time}`; `hoursNote` optional. |
| `services` | `{id, name, price, description, keywords[]}`. Asking about a service, or its price, answers from here. `priceNote` is appended to price answers. |
| `faqs` | `{id, questions[], keywords[], answer, action?}`. Put English and Roman Urdu wordings in both lists. `"action": "booking"` starts the booking flow. |
| `extraKeywords` | Extra words for built-in topics: `greeting, hours, location, price, services, booking, contact, thanks`. Use for local words (an area name for `location`). A keyword starting with `=` matches exactly (no typo tolerance). |
| `quickReplies`, `timeChips` | Buttons shown in the chat and in the booking flow. |
| `welcome`, `messages` | Optional text overrides (`messages.fallback`, `greeting`, `thanks`, `booking`). |
| `threshold` | Minimum confidence, default 0.5. Raise it for fewer wrong answers and more fallbacks. |
| `aiMode` | See below. Off by default. |

Tips: use distinctive keywords. A very common word as a keyword (for example "time") will pull in unrelated questions. Phrases such as `"kab khulta"` need all their words present.

## Embed on an existing site

Upload `widget.js` and your JSON file next to the site, then add the one script tag above. The chat renders inside a shadow root, so the host page's CSS will not break it and it will not change the page's styles. `data-config` is resolved relative to the page URL. For a WordPress or Wix site, paste the tag into a "custom code" or footer HTML field.

## Host free on GitHub Pages

1. Create a GitHub repository and push the contents of this folder (the owner decides what to publish; do not publish a client's private details).
2. Repository Settings, Pages, deploy from the `main` branch root.
3. Your site appears at `https://<user>.github.io/<repo>/`. Hosting is free. A custom domain is optional and costs the domain fee only.

Netlify, Cloudflare Pages or any plain web host work the same way: it is only static files.

## Optional AI mode (for recorded demos only)

Set in the config:

    "aiMode": { "enabled": true, "endpoint": "http://localhost:11434", "model": "llama3.2", "timeoutMs": 15000 }

When no FAQ matches, the question is sent to a local Ollama server with the business info as context. If Ollama is not running, it fails silently and the normal fallback is shown. It only works on a machine running Ollama (the visitor's browser calls localhost), so it is not for production. Allow your page origin with `OLLAMA_ORIGINS` if the browser blocks the request. Answers are labelled as AI-generated and can be wrong.

## Known limitations

- This is FAQ and keyword matching, not a general AI. It answers what the config covers and falls back otherwise.
- It can match the wrong topic when an unrelated sentence contains a trigger word (for example "bitcoin rate" looks like a price question; "my phone is broken" looks like a contact question). Test with real customer wording and tune keywords.
- Typo tolerance is small (one or two letters, words under 5 letters must be exact). Roman Urdu has no standard spelling, so add the variants your customers use.
- Urdu script is only matched if you add Urdu-script keywords.
- No memory of earlier messages beyond the booking flow; no conversation context.
- Enquiries are not stored anywhere. The customer must press send in WhatsApp; there is no delivery confirmation and no dashboard.
- Config is public (anyone can read the JSON), so never put private data in it.
- `fetch` of the config needs http(s); `file://` does not work.
- Tested in the Chrome-based browser pane only; keyboard use (Tab trap, Escape, focus return) and reduced-motion are implemented but not tested with a screen reader.
