# Course Check

Course Check is a Tauri desktop application for managing curriculum plans, modules, and courses for credit tracking workflows.

The app is designed around a simple manual workflow:

- Create a curriculum plan
- Create modules inside the plan
- Maintain a global course pool grouped by semester
- Add courses from the course pool into modules

## Tech Stack

- Rust
- Tauri
- TypeScript
- Vite

## Current Features

- Curriculum plan creation, rename, and deletion
- Nested module creation
- Module finished state toggle
- Semester-based course pool
- Course pool statistics
- Assigned / unassigned course state in the course pool
- Add module courses from the shared course pool
- Delete confirmation for plans, modules, and courses
- Cascading deletion:
  - Deleting a course pool course also removes matching module courses
  - Deleting a semester also removes its courses and matching module courses

## Project Structure

- `src/`: frontend
- `src-tauri/`: Rust backend and Tauri shell
- `data/`: local application data storage

## Development

Install dependencies:

```bash
npm install
```

Start the app in development mode:

```bash
npm run tauri dev
```

Build the frontend only:

```bash
npm run build
```

Run Rust checks:

```bash
cargo check -p course-check-app
```

## Windows Quick Start

A simple Windows launcher script is included:

- `start-app.bat`

Double-click it to start the app in Tauri development mode.

## Data Storage

Application data is stored locally in:

```text
data/course-check-data.json
```

This file is created in the project directory.

## Notes

- Course names in the course pool must be unique.
- Courses are currently matched to module entries by course name.
- Semester groups are the top-level organization unit for the course pool.

## Status

This project is currently a local desktop workflow tool focused on manual course and module management.
