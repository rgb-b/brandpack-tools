# WorkBase Server

Backend server for WorkBase v3.0.0, providing RESTful API with SQLite database.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env if needed (defaults should work for development)
   ```

3. **Initialize database:**
   ```bash
   npm run migrate
   ```
   This will create the SQLite database with all necessary tables.

## Development

**Start development server with auto-reload:**
```bash
npm run dev
```

Server will start on `http://localhost:8080`

## Production

**Start production server:**
```bash
NODE_ENV=production npm start
```

## API Endpoints

**Base URL:** `http://localhost:8080/api/v1`

### Inventory
- `GET /inventory` - Get all inventory items
- `GET /inventory/:id` - Get specific item
- `POST /inventory` - Add new item
- `PUT /inventory/:id` - Update item/stock
- `DELETE /inventory/:id` - Delete item
- `GET /inventory/usage` - Get usage history

### Productivity
- `GET /productivity/tasks` - Get all tasks
- `POST /productivity/tasks` - Add task
- `DELETE /productivity/tasks/:status/:name` - Delete task
- `GET /productivity/history` - Get time entries
- `POST /productivity/history` - Add time entry
- `GET /productivity/daily-totals` - Get daily totals
- `GET /productivity/task-totals` - Get task totals

### Pantone
- `GET /pantone` - Get all colors (with pagination)
- `POST /pantone/bulk` - Bulk import colors
- `GET /pantone/search?q=` - Search colors
- `PUT /pantone/:id` - Update color

### Maintenance
- `GET /maintenance/checklist/:date` - Get checklist
- `PUT /maintenance/checklist/:date` - Update checklist
- `GET /maintenance/issues` - Get all issues
- `POST /maintenance/issues` - Create issue
- `PUT /maintenance/issues/:id` - Update issue
- `DELETE /maintenance/issues/:id` - Delete issue

### Dashboard
- `GET /dashboard/todos` - Get todos
- `POST /dashboard/todos` - Create todo
- `PUT /dashboard/todos/:id` - Update todo
- `DELETE /dashboard/todos/:id` - Delete todo
- `GET /dashboard/activity` - Get activity feed

### Migration
- `POST /migration/import` - Import localStorage data
- `GET /migration/export` - Export database to JSON

## Database

**Location:** `./data/brandpack.db`

**Schema:** SQLite database with 11 tables
- 2 for inventory system
- 4 for productivity tracker
- 1 for pantone colors
- 2 for maintenance tracker
- 2 for dashboard

**Backup:**
```bash
npm run backup
```

**Restore:**
```bash
npm run restore
```

Or simply copy the `data/brandpack.db` file.

## Health Check

```bash
curl http://localhost:8080/api/health
```

## Architecture

```
server/
├── src/
│   ├── config/
│   │   └── database.js      # SQLite initialization
│   ├── models/              # Database models
│   ├── routes/              # API routes
│   ├── middleware/          # Express middleware
│   ├── utils/               # Utilities
│   └── server.js            # Main entry point
├── migrations/
│   └── init.sql             # Database schema
├── data/                    # SQLite database files
└── package.json
```

## Dependencies

- **express** - Web framework
- **better-sqlite3** - SQLite database driver
- **cors** - CORS middleware
- **dotenv** - Environment configuration
- **helmet** - Security headers
- **morgan** - HTTP request logger

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `8080` | Server port |
| `CORS_ORIGIN` | `http://localhost:5173` | Frontend URL for CORS |
| `DATABASE_PATH` | `./data/brandpack.db` | Database file path |
| `LOG_LEVEL` | `debug` | Logging level |
