# Publishing to the Chrome Web Store

Steps in order. The one trap: **the store gives Pramana a new extension ID**, and Google sign-in only works for the ID its OAuth
client was made for. So the store item is created first (step 4), and the OAuth client is made for its ID (step 5).

## 1. Before you start

- [ ] Chrome Web Store developer account: <https://chrome.google.com/webstore/devconsole>, one-time US$5 fee. Use a Google account the
      team will keep (ideally a shared one, not a personal one)
- [ ] A support email address for the listing and the privacy policy
- [ ] Manual checks passed on a real Google account ([TESTING.md](TESTING.md#manual-checks-before-release)), including one Windows and
      one Mac machine (load `dist/` unpacked)

## 2. Build the package

```bash
pnpm package
```

This builds, checks the result and writes `release/pramana-<version>.zip`. It stops with a list of problems if, for example, the
OAuth client ID in `.env` is still the placeholder. The zip has no `"key"` in its manifest (the store assigns the ID); `dist/` keeps
the development manifest, so the unpacked extension keeps working.

## 3. Publish the privacy policy

1. The support address in `docs/privacy-policy.html` and `docs/index.html` is shivamsahaniii17@gmail.com.
2. Push to GitHub, then in the repository: **Settings → Pages → Deploy from a branch → `main` / `/docs`**. (Free GitHub Pages needs a
   public repository; otherwise host the single HTML file anywhere.)
3. The policy is then at `https://<user>.github.io/Pramana/privacy-policy.html`.

## 4. Create the store item (draft)

1. Developer console → **New item** → upload the zip from step 2.
2. Copy the new **item ID** (32 letters, shown in the console and in the item's URL). Don't submit yet.
3. Optional, recommended: **Package → View public key**. Put that key in `.env` as `VITE_EXTENSION_KEY=...` (one line, without the
   `-----BEGIN/END-----` lines). Unpacked development builds then get the same ID as the store, so one OAuth client works for both.

## 5. Google Cloud: OAuth for the store ID

In the Google Cloud project that holds Pramana's OAuth client (<https://console.cloud.google.com/apis/credentials>):

1. **Create credentials → OAuth client ID → Application type: Chrome Extension**, Item ID = the ID from step 4.
2. Put the new client ID in `.env` as `VITE_GOOGLE_CLIENT_ID`.
3. **OAuth consent screen** (Google Auth Platform → Branding / Audience):
   - App name *Pramana*, support email, privacy policy link from step 3
   - Scopes: only `.../auth/drive.file`. It is a non-sensitive scope, so no scope verification is needed
   - Audience: **Publish app** (move from *Testing* to *In production*). While in *Testing*, only listed test users can sign in
   - Adding a logo triggers Google's brand verification (a few days); you can publish without a logo first

## 6. Upload the final package and submit

1. `pnpm package` again (now with the store's client ID) and upload the new zip to the draft (**Package → Upload new package**).
2. Fill in the tabs from [STORE_LISTING.md](STORE_LISTING.md): store listing, privacy practices (single purpose, permission
   justifications, data usage, privacy policy URL), distribution (Public, all regions).
3. **Submit for review.** Review usually takes from a few days to two weeks; you get an email.

## 7. After approval

- [ ] Install from the store on Windows, Mac and Ubuntu; sign in; take a screenshot; record a tab and the screen; save to Drive
- [ ] Check the Help page link from the recorder window on Ubuntu

## Releasing an update

1. Raise `version` in `package.json` (e.g. 1.0.0 → 1.0.1). The store refuses a version it has already seen.
2. `pnpm package`, then **Package → Upload new package** and submit. Users get the update automatically.
