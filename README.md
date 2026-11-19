# Product Studio Core

The AI-native Product Studio, as a standalone Angular 19 app. The UI is frontend only:
it uses mock data and localStorage and makes no backend calls.

## Run

```bash
npm install
npm start          # http://localhost:4208/product-studio-core/
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Production build to `dist/product-studio-core` |
| `npm run typecheck` | Type-check without building |
| `npx ng serve --port 4300` | Run on a different port |

## Base path

The app is served under `/product-studio-core/` (`baseHref` and `deployUrl` in `angular.json`).
To serve it at the site root, set both to `/`.

## Where things are

| Path | Contents |
| --- | --- |
| `src/app/psc.routes.ts` | Routes: Home, PM Buddy, Projects, Repository, Product Intelligence, Integrations, Analytics, Jobs |
| `src/app/shell/` | App shell: left nav, chats (projects and recent), search, notifications |
| `src/app/core/pages/` | Pages |
| `src/app/core/services/` | State and mock services (conversations, project lifecycle, repository, context sources, product memory) |
| `src/app/core/constants/` | Artifact options and content, PDLC phases, icon registry (`psc-icons.ts`) |
| `src/assets/styles/` | Global styles and theme tokens |

Icons are registered explicitly in `src/app/core/constants/psc-icons.ts`.
When you use a new lucide icon name, add it there.
