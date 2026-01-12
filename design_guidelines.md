# Design Guidelines: Personal Assistant Dashboard

## Design Approach

**System Selected:** Linear + Material Design hybrid
**Rationale:** Productivity-focused application requiring clarity, quick information scanning, and efficient task management. Linear's clean aesthetics combined with Material's robust component patterns create an optimal environment for daily workflow planning.

**Core Principles:**
- Information clarity over decoration
- Scannable hierarchy for rapid daily briefing
- Functional efficiency with minimal cognitive load
- Clean, distraction-free interface

---

## Typography

**Font Stack:** Inter (via Google Fonts CDN)

**Hierarchy:**
- Page Headers: text-2xl font-semibold (32px)
- Section Titles: text-lg font-medium (18px)
- Body Text: text-base font-normal (16px)
- Labels/Metadata: text-sm font-medium (14px)
- Timestamps/Secondary: text-xs text-gray-500 (12px)

---

## Layout System

**Spacing Primitives:** Tailwind units of 2, 3, 4, 6, 8, 12
- Component padding: p-4, p-6
- Section spacing: space-y-6, space-y-8
- Card gaps: gap-4
- Page margins: p-8, p-12

**Grid Structure:**
- Main dashboard: Single column on mobile, 70/30 split on desktop (main content + sidebar)
- Task lists: Single column with full-width cards
- Calendar view: Grid layout for week view

**Container Max-widths:**
- Main content area: max-w-6xl
- Cards/panels: w-full within constraints

---

## Component Library

### Navigation
**Top Bar:**
- Fixed header with app title/logo (left)
- User settings icon (right)
- Height: h-16
- Border bottom: border-b

### Dashboard Layout
**Main Panel (Primary Focus):**
- Hero card displaying day type and primary recommendation
- Prominent typography with date/day
- Key focus areas in bullet format
- Padding: p-6

**Calendar Section:**
- Compact week view showing 2-week horizon
- Event cards with time, title, duration
- Visual indicator for events requiring preparation
- Spacing: space-y-3

**Task Section (Miro Integration):**
- Card-based task list
- Task title, source widget indicator, priority/status badges
- Checkbox interaction for completion
- Padding: p-4 per card

**Sidebar (Secondary):**
- Quick stats (tasks today, meetings count)
- Connection status indicators (CalDAV, Miro, Telegram)
- Settings access

### Cards & Containers
**Standard Card:**
- Border: border border-gray-200
- Radius: rounded-lg
- Shadow: shadow-sm
- Padding: p-6
- Background: bg-white

**Status Indicators:**
- Pill badges for day type (Focus Day, Meeting Heavy, Balanced)
- Small circular dots for connection status
- Size: text-xs px-3 py-1 rounded-full

### Forms & Inputs (Settings)
**Input Fields:**
- Border: border border-gray-300 rounded-md
- Padding: px-4 py-2
- Focus state: focus:ring-2 focus:border-blue-500

**Buttons:**
- Primary: px-4 py-2 rounded-md font-medium
- Secondary: outlined variant
- Icon buttons: p-2 rounded-md

### Data Display
**Event List Item:**
- Time badge (left)
- Event title (center)
- Duration indicator (right)
- Divider between items: border-b

**Task List Item:**
- Checkbox (left)
- Task content (center)
- Source badge (right)
- Spacing: py-3

---

## Icons

**Library:** Heroicons (via CDN)
**Usage:**
- Calendar icon for calendar section
- List icon for tasks
- Settings gear icon
- Check circles for completed items
- Clock for time indicators
- Alert triangle for preparation reminders

---

## Animations

**Minimal approach:**
- Smooth transitions on hover states: transition-colors duration-150
- Checkbox check animation: subtle scale
- No scroll-triggered or decorative animations

---

## Page Structure

**Main Dashboard:**
1. Top navigation bar
2. Date header with greeting
3. Hero card: Day type and primary recommendation (full-width)
4. Two-column layout below (desktop):
   - Left (70%): Calendar events + Tasks
   - Right (30%): Quick stats + Settings access
5. Mobile: Stack all sections vertically

**Settings Page:**
- Single column form layout
- Grouped sections: CalDAV Config, Miro Integration, Telegram Setup
- Save button (sticky at bottom on mobile)

---

## Key UX Patterns

- **Dashboard as default landing:** Immediate value on load
- **Refresh indicator:** Manual refresh button for pulling latest data
- **Empty states:** Clear messaging when no events/tasks found
- **Status feedback:** Toast notifications for sync status
- **Responsive behavior:** Collapse sidebar on tablet/mobile