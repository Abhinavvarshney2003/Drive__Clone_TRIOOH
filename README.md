# DGDrive Backend API

A production-ready Node.js + Express REST API for DGDrive — a self-hosted Google Drive clone with location management, RBAC, activity logging, and file/folder management.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database | SQLite via `better-sqlite3` (synchronous API) |
| Auth | JWT (access + refresh tokens via `jsonwebtoken`) |
| Password | bcryptjs |
| Tests | Jest + Supertest |

---

## Setup

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Start the server

```bash
npm start
# or for dev:
npm run dev
```

The API will be available at **http://localhost:3000**

The database (`drive.db`) is auto-created and seeded on first run.

### 3. Run tests

```bash
npm test
# or with coverage:
npm run test:coverage
```

> Tests use an **in-memory SQLite database** — the production `drive.db` is never touched during tests.

---

## Default Credentials

| Role | Email | Password |
|---|---|---|
| `super_admin` | `admin@drive.local` | `Admin@123` |
| `editor` | `editor@drive.local` | `Editor@123` |
| `viewer` | `viewer@drive.local` | `Viewer@123` |

---

## Role Hierarchy

```
super_admin  >  editor  >  viewer
```

- **super_admin**: Full access — manage users, roles, permissions, all CRUD
- **editor**: Create/edit/delete own files and folders, read locations
- **viewer**: Read-only access to files and folders

---

## Database Schema

```
users              — app users with role field
folders            — nested folder structure (with village_id link)
files              — uploaded file records
shares             — file/folder sharing
activity_log       — audit trail

countries          — top-level geography
states             — belongs to country
cities             — belongs to state
villages           — belongs to city (with pincode)

permissions        — fine-grained permission definitions
roles              — named role groups (super_admin, editor, viewer)
role_permissions   — M:N junction: which roles have which permissions
user_roles         — M:N junction: RBAC role assignments to users
user_villages      — M:N junction: user ↔ village access
```

---

## API Endpoints

All endpoints except `/api/auth/login` and `/api/auth/register` require:
```
Authorization: Bearer <accessToken>
```

### Authentication — `/api/auth`

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register new user (gets `viewer` role) |
| `POST` | `/api/auth/login` | Public | Login, returns `accessToken` + `refreshToken` |
| `POST` | `/api/auth/refresh` | Public | Exchange refresh token for new access token |
| `GET` | `/api/auth/me` | Auth | Get current user profile |

**Login request:**
```json
{ "email": "admin@drive.local", "password": "Admin@123" }
```

**Login response:**
```json
{
  "user": { "id": "...", "name": "Super Admin", "email": "...", "role": "super_admin" },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

---

### Users — `/api/users`

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/users` | super_admin | List all users |
| `GET` | `/api/users/stats` | super_admin | System-wide statistics |
| `GET` | `/api/users/activity` | super_admin | Full activity log |
| `GET` | `/api/users/:id` | super_admin | Get user details + stats + RBAC roles |
| `POST` | `/api/users` | super_admin | Create user |
| `PATCH` | `/api/users/:id` | super_admin | Update user (name, role, password, quota) |
| `DELETE` | `/api/users/:id` | super_admin | Delete user |
| `POST` | `/api/users/:id/assign-role` | super_admin | Assign RBAC role to user |
| `DELETE` | `/api/users/:id/roles/:role_id` | super_admin | Remove RBAC role from user |

---

### Folders — `/api/folders`

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/folders` | Auth | List folders (supports `?parent_id=`, `?view=starred\|trashed\|shared`) |
| `POST` | `/api/folders` | editor+ | Create folder |
| `GET` | `/api/folders/:id/path` | Auth | Breadcrumb path to folder |
| `PATCH` | `/api/folders/:id` | editor+ | Rename folder |
| `PATCH` | `/api/folders/:id/star` | Auth | Toggle star |
| `PATCH` | `/api/folders/:id/trash` | editor+ | Toggle trash |
| `DELETE` | `/api/folders/:id` | editor+ | Delete folder |
| `POST` | `/api/folders/:id/share` | editor+ | Share folder with a user |

---

### Files — `/api/files`

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/files` | Auth | List files (supports `?folder_id=`, `?view=starred\|trashed\|shared`) |
| `POST` | `/api/files/upload` | editor+ | Upload file (multipart/form-data) |
| `GET` | `/api/files/:id/download` | Auth | Download file |
| `PATCH` | `/api/files/:id` | editor+ | Rename file |
| `PATCH` | `/api/files/:id/star` | Auth | Toggle star |
| `PATCH` | `/api/files/:id/trash` | editor+ | Toggle trash |
| `DELETE` | `/api/files/:id` | editor+ | Delete file |
| `POST` | `/api/files/:id/share` | editor+ | Share file with user |

---

### Locations — `/api/locations`

#### Countries

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/locations/countries` | Auth | List all countries |
| `GET` | `/api/locations/countries/:id` | Auth | Get country by ID |
| `POST` | `/api/locations/countries` | editor+ | Create country |
| `PUT` | `/api/locations/countries/:id` | editor+ | Update country |
| `DELETE` | `/api/locations/countries/:id` | super_admin | Delete country |

#### States

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/locations/states` | Auth | List states (supports `?country_id=`) |
| `GET` | `/api/locations/states/:id` | Auth | Get state by ID |
| `POST` | `/api/locations/states` | editor+ | Create state |
| `PUT` | `/api/locations/states/:id` | editor+ | Update state |
| `DELETE` | `/api/locations/states/:id` | super_admin | Delete state |

#### Cities

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/locations/cities` | Auth | List cities (supports `?state_id=`) |
| `GET` | `/api/locations/cities/:id` | Auth | Get city by ID |
| `POST` | `/api/locations/cities` | editor+ | Create city |
| `PUT` | `/api/locations/cities/:id` | editor+ | Update city |
| `DELETE` | `/api/locations/cities/:id` | super_admin | Delete city |

#### Villages

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/locations/villages` | Auth | List villages (supports `?city_id=`) |
| `GET` | `/api/locations/villages/:id` | Auth | Get village by ID |
| `POST` | `/api/locations/villages` | editor+ | Create village |
| `PUT` | `/api/locations/villages/:id` | editor+ | Update village |
| `DELETE` | `/api/locations/villages/:id` | super_admin | Delete village |

---

### Roles — `/api/roles`

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/roles` | Auth | List all roles with their permissions |
| `GET` | `/api/roles/:id` | Auth | Get role + permissions + users |
| `POST` | `/api/roles` | super_admin | Create role |
| `PUT` | `/api/roles/:id` | super_admin | Update role name/description |
| `DELETE` | `/api/roles/:id` | super_admin | Delete role |
| `POST` | `/api/roles/:id/permissions` | super_admin | Assign permissions to role (bulk) |
| `DELETE` | `/api/roles/:id/permissions/:permission_id` | super_admin | Remove permission from role |

**Assign permissions:**
```json
{ "permission_ids": ["uuid1", "uuid2"] }
```

---

### Permissions — `/api/permissions`

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/permissions` | Auth | List all permissions |
| `GET` | `/api/permissions/:id` | Auth | Get permission + roles that have it |
| `POST` | `/api/permissions` | super_admin | Create permission |
| `DELETE` | `/api/permissions/:id` | super_admin | Delete permission |

---

## Seed Data Summary

| Type | Count |
|---|---|
| Countries | 2 (India, USA) |
| States | 6 (3 per country) |
| Cities | 18 (3 per state) |
| Villages | 54 (3 per city) |
| Users | 3 (admin, editor, viewer) |
| Roles | 3 (super_admin, editor, viewer) |
| Permissions | 10 |
| Folders | 5 (assigned to villages) |
| Demo image files | 8 (DB records only) |

---

## Project Structure

```
backend/
├── server.js              # Express app entry point
├── db.js                  # Database init + seed
├── auth.js                # JWT token helpers
├── jest.config.js         # Jest configuration
├── package.json
├── middleware/
│   ├── authMiddleware.js  # JWT verification
│   └── roleMiddleware.js  # Role-based access control
├── routes/
│   ├── authRoutes.js      # /api/auth
│   ├── userRoutes.js      # /api/users
│   ├── folderRoutes.js    # /api/folders
│   ├── fileRoutes.js      # /api/files
│   ├── locationRoutes.js  # /api/locations
│   ├── roleRoutes.js      # /api/roles
│   └── permissionRoutes.js# /api/permissions
└── __tests__/
    ├── testHelper.js      # In-memory DB builder
    ├── auth.test.js       # Auth endpoint tests
    ├── users.test.js      # User management tests
    ├── folders.test.js    # Folder CRUD tests
    └── locations.test.js  # Location CRUD tests
```

---

## Environment Variables

Create a `.env` file in the `backend/` directory (optional — defaults are used if absent):

```env
PORT=3000
ACCESS_SECRET=your_access_jwt_secret
REFRESH_SECRET=your_refresh_jwt_secret
```
