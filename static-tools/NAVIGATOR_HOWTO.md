# How to create a new city/county navigator

Source template: `navigator-template.html`. File naming: `[city-or-county]-navigator.html`.

## Why this file exists

The setup instructions used to live inside an HTML comment at the top of
`navigator-template.html`. That comment contained the literal text
`Update <title>, <meta name="description">, <link rel="canonical">` — which
auto-generation runs interpreted as an instruction to splice real tags into
that exact line, eating the closing `-->` along with the `<head>` and the
charset/viewport meta tags. 28 navigators shipped as raw text pages because
of it. Keeping instructions in markdown — never in the HTML — avoids the
whole class of bug.

## Required steps for each new navigator

1. Copy `navigator-template.html` to `[city]-navigator.html`.
2. Search for `[REPLACE]` and fill in every placeholder. There should be zero
   `[REPLACE]` strings left when you're done.
3. Update the `<title>`, the description meta, and the canonical link near
   the top of the file.
4. Update the county-badge text in the `render()` function.
5. Fill in all `[REPLACE]` markers in the `PATHWAYS` object.
6. Update the `<footer>` CoC ID and location.
7. Set `confidence.lastChecked` to the current month/year on each pathway.
8. Add a card in `resources.html` linking to the new tool.
9. Add the URL to `sitemap.xml`.

## Sanity check before committing

Open the file in a browser. If you see a styled page with a header badge and
quiz pathway, you're good. If you see raw text or a blank page, the comment
near the top probably swallowed the head — open the file and confirm the
opening `<!--` near line 3 has a matching `-->` before `<head>`.
