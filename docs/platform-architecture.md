# Platform Architecture: Tauri Desktop

Pawcast ships desktop-only on the Tauri runtime. The Vite dev server can still
run the app in a plain browser for development convenience, so platform
capabilities are exposed through a typed boundary and shared code never
depends on Tauri globals or packages.

## Layers

| Layer | Location | Import rule |
|---|---|---|
| 4 – Entry points | `src/pages/`, `src/components/layout/AppLayout.tsx`, `src-tauri/` | May compose any lower layer |
| 3 – Platform UI | `src/components/desktop/`, `src/components/web/` | May import Layers 1–2 only |
| 2 – Shared UI/state | `src/components/ui/`, `src/stores/`, `src/hooks/` | Must not import platform UI or entry points |
| 1 – Core/contracts | `src/utils/`, `src/services/`, `src/types/`, `src/i18n/` | Must not depend on a platform UI |

The desktop boundary lives under `src/platform/desktop/`:

- `types.ts` defines the capability-oriented `DesktopAPI` contract.
- `tauriDesktop.ts` is the only frontend module that imports Tauri command,
  event, dialog, window, and URL implementations.
- `errors.ts` converts native failures into stable, safe `DesktopError` values.
- `src/platform/runtime.ts` selects the adapter and exports `desktopApi`,
  `isDesktop`, and the platform-aware fetch transport.

## Directory layout

```text
src/
├── components/
│   ├── desktop/             # Tauri desktop UI (Layer 3)
│   │   ├── DesktopAppLayout.tsx
│   │   ├── DesktopFileOpener.tsx
│   │   └── FolderBrowser.tsx
│   ├── web/                 # Browser dev fallback (Layer 3)
│   │   └── WebAppLayout.tsx
│   └── layout/
│       ├── AppLayout.tsx    # The platform selector
│       └── AppLayoutBase.tsx
├── pages/
│   ├── HomePage.tsx
│   ├── DesktopHomePage.tsx
│   ├── DesktopSettingsWindowPage.tsx
│   └── DesktopGlossaryWindowPage.tsx
├── platform/
│   ├── runtime.ts
│   └── desktop/
├── stores/
│   └── desktopStorage.ts    # Zustand StateStorage capability adapter
└── types/
    └── desktop.ts           # Shared desktop domain contracts
```

## Rules

### Runtime selection

`isDesktop()` is defined in `src/platform/runtime.ts`. `AppLayout` uses it to
select `DesktopAppLayout` or the `WebAppLayout` dev fallback; other shared
consumers use the nullable `desktopApi` capability rather than performing
their own runtime detection.

### Tauri isolation

Imports from `@tauri-apps/*` and accesses to Tauri internals are limited to
`src/platform/desktop/tauriDesktop.ts` and runtime detection in
`src/platform/runtime.ts`. Components, stores, repositories, hooks, and
services consume `DesktopAPI` methods.

### Import direction

Platform directories are siblings. Imports between `components/desktop/` and
`components/web/` are forbidden. Shared behavior belongs in Layers 1–2 and is
provided to each platform implementation.

### Placement decision

```text
Requires a native desktop capability?  → src/components/desktop/
Pure logic or a transport contract?    → src/utils/, src/services/, src/types/
Shared UI?                              → src/components/<domain>/
```

Pages always render the `AppLayout` facade. They must not import
`DesktopAppLayout` or `WebAppLayout` directly.

### Desktop commands and events

Add native capabilities in this order:

1. Add a behavior-oriented method and domain types to `DesktopAPI`.
2. Implement its explicit snake_case Tauri command/event mapping in
   `tauriDesktop.ts`.
3. Implement and register the corresponding Rust command or event.
4. Consume only the `desktopApi` method from frontend code.
5. Add an adapter test covering payload mapping and listener cleanup.

Every event subscription returns immediate cleanup. Cleanup must remain safe
when asynchronous Tauri listener registration resolves after React unmounts.
