# Lune Web

*Your universe. Your media.*

The official web interface and administration console for [Lune Server](https://github.com/LuneServer/lune). Built with React 19, TypeScript, Vite, and Tailwind CSS v4 using the [Lune Brand](https://github.com/LuneServer/lune-brand) design tokens.

## Development

Start `lune` on `:8080`, then run:

```bash
npm install
npm run dev
```

## Production Bundle (Served Directly by Lune Server)

```bash
npm run build
LUNE_WEB_DIR="$(pwd)/dist" lune
```
