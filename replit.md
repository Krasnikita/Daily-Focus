# Daily Agenda Assistant

## Overview

A personal assistant dashboard that aggregates data from multiple sources (CalDAV calendar, Miro boards) and sends daily agenda summaries to Telegram. The application is built as a full-stack TypeScript project with a React frontend and Express backend.

The core workflow is:
1. Fetch calendar events from a CalDAV server (configured for Yandex Calendar)
2. Extract focus areas from a Miro board's mindmap structure
3. Combine the information into a formatted message
4. Send the summary to a Telegram chat

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (supports light/dark modes)
- **Build Tool**: Vite with HMR support

The frontend is a single-page application with a simple interface for triggering agenda generation. Design follows Linear + Material Design hybrid approach focused on productivity and clarity.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM (schema in `shared/schema.ts`)
- **Configuration**: JSON file-based config (`config.json`) validated with Zod schemas
- **Build**: esbuild for production bundling with selective dependency bundling

Key backend services:
- `CalDAVService`: Connects to CalDAV servers using tsdav library to fetch calendar events
- `MiroService`: Fetches board items via Miro REST API to extract focus areas from mindmaps
- `TelegramService`: Sends formatted messages via Telegram Bot API
- `TelegramBotService`: Polls for Telegram updates, handles "Запустить" button to trigger agenda generation with 10-minute timeout

### Project Structure
```
client/           # React frontend
  src/
    components/ui/  # shadcn/ui components
    pages/          # Route components
    hooks/          # Custom React hooks
    lib/            # Utilities and query client
server/           # Express backend
  services/       # CalDAV, Miro, Telegram integrations
  routes.ts       # API endpoint definitions
  index.ts        # Server entry point
shared/           # Shared types and schemas
  schema.ts       # Zod schemas and TypeScript types
```

### API Design
Single POST endpoint `/api/generate-agenda` that:
1. Reloads configuration from file
2. Fetches data from CalDAV and Miro (with error handling for each)
3. Combines into formatted message
4. Sends to Telegram
5. Returns result with success status and any partial errors

### Configuration Pattern
Configuration is stored in `config.json` and validated at runtime using Zod schemas. This allows credentials to be updated without code changes. The config includes sections for CalDAV, Miro, and Telegram credentials.

## External Dependencies

### Third-Party Services
- **CalDAV Calendar**: Yandex Calendar (or any CalDAV-compatible server) for event data
- **Miro API**: REST API v2 for reading board content and mindmap structures
- **Telegram Bot API**: For sending formatted agenda messages to specified chats

### Database
- **PostgreSQL**: Primary database (configured via `DATABASE_URL` environment variable)
- **Drizzle ORM**: Type-safe database queries with schema migrations in `/migrations`

### Key NPM Packages
- `tsdav`: CalDAV client for calendar integration
- `node-fetch`: HTTP client for Miro and Telegram APIs
- `drizzle-orm` + `drizzle-kit`: Database ORM and migration tools
- `zod`: Runtime schema validation
- `@tanstack/react-query`: Async state management
- `@radix-ui/*`: Accessible UI primitives
- `tailwindcss`: Utility-first CSS framework