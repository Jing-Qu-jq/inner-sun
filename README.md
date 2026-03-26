# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:
### `npm install`

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.

### `npm run deploy`

Deploys the app to GitHub Pages.\
This command builds the app and pushes it to the `gh-pages` branch.\
Make sure you have `gh-pages` installed as a dev dependency before running this command.

## GitHub Pages Setup

### GitHub Repository Settings

1. Go to your GitHub repository
2. Click **Settings** → **Pages**
3. Under "Build and deployment":
   - **Source**: Select "Deploy from a branch"
   - **Branch**: Select `gh-pages` and `/root` folder
4. Click **Save**
5. Wait a few minutes for GitHub Pages to build and deploy
6. Your site will be available at https://your-username.github.io/your-repo-name

**Note**: The `gh-pages` branch is automatically created when you run `npm run deploy` for the first time.

### Installation

Install `gh-pages` as a development dependency:
```bash
npm install gh-pages --save-dev
```

### Configuration

1. Add a `homepage` field to your `package.json`:
     ```json
     "homepage": "https://your-username.github.io/your-repo-name"
     ```

2. If deploying to a subdirectory, add `basename` to your BrowserRouter in `src/App.js`:
   ```jsx
   <BrowserRouter basename="/your-repo-name">
   ```

3. The `package.json` should already have these scripts:
   ```json
   "predeploy": "npm run build",
   "deploy": "gh-pages -d build"
   ```

### Deployment

Run the deploy command:
```bash
npm run deploy
```

This will build your app and push it to the `gh-pages` branch on GitHub.

