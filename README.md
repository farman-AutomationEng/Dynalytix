# Dynalytix — MyGeotab Add-In
**Dynasty Communications | Developed by Farman**

---

## FOLDER STRUCTURE

```
dynalytix-addin/
├── addin.json                   ← MyGeotab manifest (yahi paste karein)
├── index.html                   ← Add-in main page
├── images/
│   └── icon.svg                 ← Sidebar icon
├── src/
│   ├── api.js                   ← Geotab API wrapper
│   ├── app.js                   ← App lifecycle controller
│   ├── utils.js                 ← Helper functions
│   └── pages/
│       ├── homepage.js
│       ├── leaderboard.js
│       ├── scored-events.js
│       ├── scorecard.js
│       ├── preventative-maintenance.js
│       ├── compliance-utilization.js
│       └── coaching-engagement.js
└── styles/
    └── main.css
```

---

## DEPLOYMENT — GITHUB PAGES

```bash
# 1. Repo banao (naam mein dash mat rakhein — Geotab URL restriction)
# Repo name: dynalytix

git init
git add .
git commit -m "Dynalytix Add-in v1.0.0"
git branch -M main
git remote add origin https://github.com/farman-AutomationEng/dynalytix.git
git push -u origin main

# 2. GitHub Settings → Pages → Source: main branch → Save
# Live URL: https://farman-AutomationEng.github.io/dynalytix/
```

---

## MYGEOTAB INSTALLATION

1. **Administration → System → System Settings → Add-Ins**
2. **New Add-In** button click karein
3. `addin.json` ka pura content paste karein
4. **Save** → Browser **refresh** karein
5. Left sidebar mein "Dynalytix" appear hoga

---

## ⚠️ CRITICAL NOTES

### Geotab URL Restriction
- Hosted URL mein dashes `-`, `@`, `#` **allowed nahi** hain path mein
- GitHub username `farman-AutomationEng` mein dash hai — agar issue aaye toh
  `farmanautomation` jaisa username bana saktay hain ya organization use karein

### CSP Compliance
- Koi bhi inline `<script>` ya `<style>` block ADD-IN mein forbidden hai
- `localStorage` / `sessionStorage` use mat karein — Geotab support nahi karta
- Saray JS/CSS files external link se load ho rahay hain ✓

### Lifecycle (app.js)
- `initialize()` → `callback()` zaroor call hota hai → trigger karta hai `focus()`
- `focus()` → data fetch + page render hota hai
- `blur()` → cleanup

---

## PAGES

| Page | URL Hash | Description |
|------|----------|-------------|
| Homepage | #homepage | Score gauge, trend, KPIs |
| Leaderboard | #leaderboard | Driver rankings, donut chart |
| Scored Events | #scored-events | Driver-wise event counts |
| Scored Events Vehicle | #scored-events-vehicle | Vehicle-wise event counts |
| Scorecard | #scorecard | Safety scorecard report |
| Preventative Maintenance | #pm | Engine/vehicle diagnostics |
| Compliance & Utilization | #compliance | Drive metrics |
| Coaching & Engagement | #coaching | Coaching sessions |

---

## SCORING ALGORITHM

```
Score = Σ (event_weight × event_count) per driver/vehicle

Low:    0–999   → Green  ✓
Medium: 1000–4999 → Orange ⚠
High:   5000+   → Red    🚨
```

Weights: `src/utils.js` → `EVENT_WEIGHTS` object mein customize karein.

---

## SUPPORT
farman@dynastync.com
