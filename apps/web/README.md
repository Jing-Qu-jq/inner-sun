# @innersun/web

The InnerSun React SPA (originally bootstrapped with
[Create React App](https://github.com/facebook/create-react-app)).

This is the `apps/web` workspace of the InnerSun monorepo. For the full picture —
installing everything, running the web app **and** the API together on localhost —
see the [root README](../../README.md). This file covers web-specific details and
GitHub Pages deployment.

## Run just the web app

From the **repo root** (dependencies are installed once at the root via npm workspaces):

```bash
npm install          # once, at the repo root
npm run dev:web      # start only the web app  → http://localhost:3000
```

Or run web + api together with `npm run dev` (see the root README).

You can also run scripts directly against this workspace from the root:

```bash
npm run start --workspace @innersun/web   # dev server
npm run build --workspace @innersun/web   # production build → apps/web/build
npm test  --workspace @innersun/web       # test runner (watch mode)
```

During development the app proxies API requests to `http://localhost:3001`
(the `proxy` field in this workspace's `package.json`).

## GitHub Pages (prototype hosting)

The prototype stays publishable to GitHub Pages. From the **repo root**:

```bash
npm run deploy:web
```

This builds `apps/web` and pushes `apps/web/build` to the `gh-pages` branch
(via the `gh-pages` dev dependency).

### How it's configured

- **`homepage`** in this workspace's `package.json` is set to
  `https://jing-qu-jq.github.io/inner-sun`, so the build is hosted at `/inner-sun/`.
- Routing uses **`HashRouter`** ([src/App.js](src/App.js)), so no `basename` /
  base-path configuration is needed for the subdirectory to work.
- Scripts live in this workspace's `package.json`:
  ```json
  "predeploy": "npm run build",
  "deploy": "gh-pages -d build"
  ```

### GitHub repository settings (one-time)

1. Repo **Settings** → **Pages**.
2. Under "Build and deployment": **Source** = "Deploy from a branch",
   **Branch** = `gh-pages` / `/ (root)`.
3. Save. The site publishes at the URL in the `homepage` field.

The `gh-pages` branch is created automatically the first time you run the deploy command.
