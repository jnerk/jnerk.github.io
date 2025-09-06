# JNERK ASCII Site

A minimalist personal homepage featuring a real-time animated ASCII cube, theme switching, and accessible design.

## Features

-   **Animated ASCII Cube:** Pixel-perfect, auto-scaling, and depth-faded cube rendered in ASCII art.
-   **Dark/Light Theme:** Toggle between dark and light modes, with OS preference detection and persistence.
-   **Fast & Lightweight:** Built with [Vite](https://vitejs.dev/) for instant reloads and optimized builds.

## Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org/) (v18+ recommended)
-   [npm](https://www.npmjs.com/)

### Installation

```sh
npm install
```

### Development

Start the local dev server:

```sh
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

Create a production build:

```sh
npm run build
```

### Deploy

Deploy to GitHub Pages:

```sh
npm run deploy
```

> Automated deployment is configured via [`.github/workflows/deploy.yaml`](.github/workflows/deploy.yaml).

## Project Structure

-   [`index.html`](index.html): Main HTML entry point.
-   [`src/main.js`](src/main.js): ASCII cube engine and theme logic.
-   [`src/style.css`](src/style.css): Custom styles and theme tokens.
-   [`vite.config.js`](vite.config.js): Vite configuration.
-   [`package.json`](package.json): Scripts and dependencies.

## License

This project is open source and available under the MIT License.

---

© 2025 [github.com/jnerk](https://github.com/jnerk)
