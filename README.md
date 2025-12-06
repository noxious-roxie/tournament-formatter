# tournament-formatter (advanced)

This repository contains a quick static frontend tool for parsing Smogon tournament threads and producing Smogon-ready BBCode for replays and keys.

## Files
- index.html — UI
- script.js — parser + generator + CORS fallback
- style.css — styling
- vercel.json — Vercel config (public static site)

## Quick deploy
1. Create a new GitHub repo named `tournament-formatter` (or any name).
2. Upload the files from this repo (do NOT upload the zip file directly).
3. In Vercel, import the GitHub repo and deploy as a static site.
4. Open the deployed site, paste a Smogon thread URL, click Parse → Generate.
