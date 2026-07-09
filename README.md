# RegVis — Interactive Linear Regression Visualization

> **Live demo:** [spimelab.com/learn/ols](https://spimelab.com/learn/ols)

RegVis is an open-source, browser-based interactive visualization system that makes the mathematical mechanics of ordinary least squares regression directly perceivable. It transforms abstract statistical formulas into observable geometric phenomena through three features not found together in any existing tool: geometric error decomposition, interactive confidence interval sampling, and a coordinated three-view diagnostic architecture.

---

## Features

### 1. Geometric Error Decomposition
- **SSE squares** — red translucent squares extend from each data point to the regression line; each square's area equals the squared residual $(y_i - \hat{y}_i)^2$
- **TSS squares** — grey translucent squares extend from each point to the mean line; each area equals $(y_i - \bar{y})^2$
- **R² as a visual proportion** — the ratio of red to grey area makes $R^2 = 1 - SSE/TSS$ directly perceivable without calculation
- All layers are independently toggleable for progressive exploration

### 2. Interactive Confidence Interval Sampling
- Click **Sample** to randomly select 70 % of points, fit a regression line to the subset, and overlay it as a persistent grey trace
- Repeat to accumulate traces — after ~20 iterations the empirical coverage (~95 % of traces inside the 95 % band) makes the frequentist definition of confidence intervals observable
- Adjust the confidence level α via slider (0.01–0.20) and watch band width and coverage change in real time

### 3. Coordinated Three-View Diagnostics
All three panels update synchronously in under 100 ms on every dataset change:

| View | Purpose |
|---|---|
| **Scatterplot** | Data, regression line, error squares, confidence and prediction intervals |
| **Residuals vs. Fitted** | Reveals heteroscedasticity (cone patterns) and non-linearity |
| **Q-Q Plot** | Reveals departures from normality (heavy tails, skewness, outliers) |

Hovering over any point in any view highlights that observation across all three simultaneously.

### 4. Direct Data Manipulation
- **Click** anywhere in the scatterplot to add a point
- **Click** an existing point to remove it
- Every change propagates to all views and statistics within 100 ms
- Axis ranges adjustable via input fields

### 5. Guided Tutorial
An optional step-by-step tutorial walks through dataset construction, SSE/TSS visualization, variance decomposition, confidence interval sampling, and diagnostic coordination — with pulsing highlights and contextual tooltips. Exit at any time to explore freely.

---

## Getting Started

### Option 1 — Use the hosted version
Visit [spimelab.com/learn/ols](https://spimelab.com/learn/ols) — no installation required.

### Option 2 — Run locally
```bash
git clone https://github.com/[username]/RegVis.git
cd RegVis
# Open index.html in any modern browser
open index.html          # macOS
start index.html         # Windows
xdg-open index.html      # Linux
```

There is no build step. D3.js v7 is loaded automatically via CDN. A local web server is not required.

### Option 3 — Deploy as a static site
Copy the repository contents to any static file host (GitHub Pages, Netlify, Vercel, etc.). No server-side runtime is needed.

---

## Browser Compatibility

| Browser | Minimum version |
|---|---|
| Chrome | 90 |
| Firefox | 88 |
| Safari | 14 |
| Edge | 90 |

Touch events are supported — RegVis works on tablets and smartphones.

---

## Repository Structure

```
RegVis/
├── index.html          # Entry point
├── css/
│   └── style.css       # Layout and visual theme
├── js/
│   ├── ols_diagonostics.js # Application
├── images/             # Screenshot assets
└── README.md
```

---

## Technical Details

RegVis is a single-page application built entirely in client-side JavaScript. All computation and rendering occur in the browser with no server dependencies.

**Pipeline latency (n < 200 points)**

| Stage | Time |
|---|---|
| Data array update | < 5 ms |
| Statistical recalculation | < 20 ms |
| SVG rendering (D3 transitions) | < 75 ms |
| **Total** | **< 100 ms** |

For n > 500 points the rendering layer switches from SVG to Canvas automatically to maintain responsiveness.

**Why D3.js?** Higher-level charting libraries do not expose the low-level DOM control needed for custom SVG rectangles with area = $(y_i - \hat{y}_i)^2$, persistent sampling overlays, or synchronized cross-view highlighting. D3.js v7 is used throughout.

---

## Evaluation

An expert evaluation with 18 statistics professionals (12 university instructors, 6 data analysts) compared RegVis against a representative fragmented-tools workflow using a within-subjects counterbalanced design.
---

## Citation

If you use RegVis in your research or teaching, please cite:

```bibtex
@article{uzair2025regvis,
  author  = {Uzair, Hamna and Ahmad, Uzair},
  title   = {RegVis: An Interactive Web-Based Visualization System
             for Linear Regression Analysis and Diagnostics},
  journal = {SoftwareX},
  year    = {2025},
  note    = {\url{https://spimelab.com/learn/ols}}
}
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Contact

For questions or feedback open a GitHub issue or email [author email].
