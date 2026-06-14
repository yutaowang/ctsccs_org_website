# SCCS Website

Modern React rebuild of the Southeastern Connecticut Chinese School website:

- 东南康州中文学校
- Southeastern Connecticut Chinese School
- Original website: <https://ctsccs.org/>

The project reproduces the original site's public content with a responsive
layout, local client-side navigation, mobile menus, and updated presentation.

## Tech Stack

- React 18
- Vite 5
- Plain CSS
- Browser History API for client-side routing

## Getting Started

Requirements:

- Node.js 18 or newer
- npm

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

To use a specific port:

```bash
npm run dev -- --host 0.0.0.0 --port 5174
```

Then open <http://localhost:5174/>.

## Production Build

Create an optimized build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

The generated files are written to `dist/`.

## Pages

The application includes local pages for:

- `/about`
- `/administration`
- `/regulation`
- `/newsletters`
- `/catalog`
- `/registration`
- `/calendar`
- `/courses`
- `/contact`
- `/location`
- `/community-services`
- `/sponsors`
- `/resources`
- `/links`
- `/feedback`

Internal navigation remains inside the React application instead of opening the
original `.aspx` pages.

## Project Structure

```text
src/
  main.jsx       Application shell, navigation, home page, and routing
  pages.jsx      Content for all internal pages
  styles.css     Global and responsive styles
index.html       Vite HTML entry point
```

## External Resources

Some public assets are still loaded from `https://ctsccs.org/`, including:

- Homepage slideshow images
- Sponsor and community-service images
- PDF handbooks, catalogs, calendars, newsletters, and course descriptions
- The existing My SCCS login and registration system

An internet connection and availability of the original website are therefore
required for those resources. To make the site fully standalone, download the
assets into `public/` and update the URLs in `src/main.jsx` and `src/pages.jsx`.

## Deployment

This is a single-page application. The hosting service should rewrite unknown
paths such as `/about` and `/courses` to `/index.html`.

For a basic static host, deploy the contents of `dist/` after running
`npm run build`.

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).
