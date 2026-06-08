# Cloudflare Pages Deployment

## Project settings

- Project folder: `E:\.stock\.dotori`
- Build command: empty
- Output directory: `/`
- Framework preset: None or Static HTML

## GitHub connected Pages deployment

Use this mode for production because Cloudflare Pages Functions under `functions/api/*` are deployed from the repository.

- Repository root: this `.dotori` folder
- Production branch: `main`
- Framework preset: `None`
- Build command: empty
- Build output directory: `/`
- Functions directory: `functions`

After connecting the GitHub repository, add the Production environment variables:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

Then deploy and verify:

- `/api/quote?symbol=MRVL` returns JSON
- `/api/stock-report?symbol=011070` returns JSON
- `/data/public-snapshot.json` returns JSON

## Dotori Web storage

Use Turso as the shared storage for Dotori Web.

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

When Turso variables exist, `/api/stock-report` saves every fetched report:

- Latest report: `stock_reports`
- History report: `stock_report_history`

The browser also stores a fallback copy in `localStorage`.

The Pages Functions create these tables automatically if they are missing:

```sql
CREATE TABLE IF NOT EXISTS stock_reports (
  symbol TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  saved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_report_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  payload TEXT NOT NULL,
  saved_at TEXT NOT NULL
);
```

## Before AdSense review

1. Replace `dotoristock.com` in all HTML files, `robots.txt`, and `sitemap.xml` with the final custom domain if you connect one.
2. Replace contact placeholders with real contact email addresses before public launch.
3. Keep `data/public-snapshot.json` updated with public, non-sensitive report data.
4. Run `python generate_static_reports.py` after public data updates so `/reports/` and `sitemap.xml` stay current.
5. Register the domain in Google Search Console.
6. Submit `sitemap.xml` in Google Search Console.
7. Publish at least 10 substantial public report pages before applying for AdSense.
8. Add the AdSense site connection meta tag only after receiving the real publisher ID.
9. Copy `ads.txt.example` to `ads.txt`, replace the publisher ID, and confirm `/ads.txt` returns HTTP 200.
10. Request review in AdSense.

## SEO and AdSense checklist

- The home dashboard displays working data.
- Feature explanation, FAQ, About, Privacy, Terms, and Risk Notice pages exist.
- Every page has a unique title, description, canonical URL, and crawlable internal links.
- The site avoids direct buy/sell commands and guaranteed-profit claims.
- Reports include update time, source criteria, and original analysis.
- Mobile layout, broken links, and page speed are checked before review.
