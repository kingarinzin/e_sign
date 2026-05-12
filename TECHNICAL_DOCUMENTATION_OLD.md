# E-Sign Application - Technical Documentation

## Quick Reference

**Tech Stack:** Next.js 16, MongoDB, JWT auth, Tailwind CSS, pdf-lib, nodemailer  
**Database:** `e_sign_db` with collections: `users`, `meetings`  
**File Storage:** Local filesystem at `public/uploads/`

---

## Core Concepts

### Authentication
- JWT tokens stored in localStorage
- Each API route validates tokens independently (not using middleware)
- Admin routes use `verifyAdmin()` helper from `src/lib/admin-auth.ts`
- Login checks user approval status before allowing access

### User Approval Flow
1. Signup creates user with `approvalStatus: 'pending'`
2. Login blocked until admin approves
3. Admin approves at `/admin/pending-users`
4. User can then login successfully

### Document Signing Flow
1. **Upload** → `POST /api/file` saves to `public/uploads/`
2. **Create Meeting** → `POST /api/meetings` with status `Draft`
3. **Prepare Fields** → Drag/drop fields at `/prepare/[id]`, save via `POST /api/meetings/[id]/fields`
4. **Send** → `POST /api/meetings/[id]/send` sets first signer as `isCurrent`, sends email
5. **Sign** → Sequential signing via `POST /api/meetings/[id]/sign`, each completion triggers next signer email
6. **Complete** → Last signature sets status to `Completed`, organizer gets email

### Key Patterns
- **MongoDB Singleton:** Use `clientPromise` from `src/lib/mongodb.tsx` (prevents connection pool exhaustion)
- **Mixed ObjectId:** Use `getUserIdVariants()` when querying by `organizerId` (handles string/ObjectId inconsistency)
- **Sequential Signing:** Enforced by `isCurrent` flag and `order` field on participants
- **Email Timing:** Always update database FIRST, then send emails

---

## Database Schema

### `users` Collection

```
c:\Users\sujal\Desktop\e-sign\
├── public/
│   └── uploads/              # File storage directory
│       └── [sanitized-name]-[hash].[ext]
│
├── src/
│   ├── app/                  # Next.js App Router pages & API
│   │   ├── layout.tsx        # Root layout
│   │   ├── page.tsx          # Landing page (/)
│   │   ├── globals.css       # Tailwind imports
│   │   │
│   │   ├── api/              # API Route Handlers
│   │   │   ├── auth/
│   │   │   │   ├── login/route.tsx      # POST /api/auth/login
│   │   │   │   └── signup/route.tsx     # POST /api/auth/signup
│   │   │   │
│   │   │   ├── admin/
│   │   │   │   ├── pending-users/route.ts      # GET /api/admin/pending-users
│   │   │   │   ├── approve-user/route.ts       # POST /api/admin/approve-user
│   │   │   │   ├── all-users/route.ts          # GET /api/admin/all-users
│   │   │   │   ├── delete-user/route.ts        # DELETE /api/admin/delete-user
│   │   │   │   └── toggle-user-status/route.ts # POST /api/admin/toggle-user-status
│   │   │   │
│   │   │   ├── meetings/
│   │   │   │   ├── route.tsx                   # GET/POST /api/meetings
│   │   │   │   └── [id]/
│   │   │   │       ├── route.tsx               # GET/PUT/DELETE /api/meetings/[id]
│   │   │   │       ├── fields/route.tsx        # POST /api/meetings/[id]/fields
│   │   │   │       ├── send/route.tsx          # POST /api/meetings/[id]/send
│   │   │   │       ├── sign/route.tsx          # POST /api/meetings/[id]/sign
│   │   │   │       ├── pdf/route.tsx           # GET /api/meetings/[id]/pdf
│   │   │   │       └── download/route.tsx      # GET /api/meetings/[id]/download
│   │   │   │
│   │   │   ├── user/
│   │   │   │   ├── profile/route.tsx           # GET /api/user/profile
│   │   │   │   ├── change-password/route.ts    # POST /api/user/change-password
│   │   │   │   └── update-signature/route.tsx  # POST /api/user/update-signature
│   │   │   │
│   │   │   ├── file/route.tsx                  # POST /api/file (upload)
│   │   │   └── uploads/[file]/route.ts         # GET /api/uploads/[file]
│   │   │
│   │   ├── admin/
│   │   │   ├── pending-users/page.tsx  # Admin approval dashboard
│   │   │   └── all-users/page.tsx      # Admin user management
│   │   │
│   │   ├── dashboard/
│   │   │   ├── page.tsx                # Main dashboard
│   │   │   ├── documents/page.tsx      # Document listing
│   │   │   ├── new-meeting/
│   │   │   │   ├── page.tsx            # Upload & create meeting
│   │   │   │   └── NewMeetingPdfClient.tsx
│   │   │   └── meetings/[id]/
│   │   │       ├── page.tsx            # View meeting details
│   │   │       └── edit/
│   │   │           ├── page.tsx
│   │   │           └── EditPdfClient.tsx
│   │   │
│   │   ├── prepare/[id]/
│   │   │   ├── page.tsx                # Field positioning UI
│   │   │   ├── PdfRenderer.tsx         # Drag-drop field placement
│   │   │   └── PrepareThumbnails.tsx   # Page thumbnails
│   │   │
│   │   ├── sign/[id]/
│   │   │   ├── page.tsx                # Signing interface
│   │   │   └── SigningView.tsx         # Canvas/upload signature
│   │   │
│   │   ├── view/[id]/page.tsx          # View completed document
│   │   ├── login/page.tsx              # Login form
│   │   ├── signup/page.tsx             # Registration form
│   │   └── settings/page.tsx           # User settings (password change)
│   │
│   ├── components/
│   │   ├── Sidebar.tsx                 # Navigation sidebar
│   │   └── SuccessModal.tsx            # Success notification modal
│   │
│   ├── lib/
│   │   ├── mongodb.tsx                 # MongoDB singleton connection
│   │   ├── auth-helpers.ts             # getUserIdVariants() helper
│   │   └── admin-auth.ts               # verifyAdmin() helper
│   │
│   ├── models/
│   │   └── user.tsx                    # User TypeScript interface
│   │
│   ├── types/
│   │   ├── meeting.ts                  # Meeting TypeScript types
│   │   └── formidable-serverless.d.ts  # Type declarations
│   │
│   └── scripts/
│       └── setup-admin.ts              # Admin setup script (not in structure)
│
├── .env.local                          # Environment variables
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── next.config.ts
├── WORKFLOW_IMPLEMENTATION.md          # Workflow documentation
├── ADMIN_SETUP.md                      # Admin setup guide
└── README.md
```

---

## Core Workflows

### 1. User Registration & Approval Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER SIGNUP                                               │
│    Route: /signup → POST /api/auth/signup                    │
│    Creates user with:                                        │
│      - approvalStatus: 'pending'                            │
│      - isApproved: false                                    │
│      - password: bcrypt hashed                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. USER TRIES TO LOGIN                                       │
│    Route: /login → POST /api/auth/login                      │
│    Check order:                                              │
│      1. User exists?                                         │
│      2. isApproved === true?  ❌ → 403 "pending approval"   │
│      3. Password matches?                                    │
│      4. Generate JWT with {id, email, isAdmin}               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. ADMIN APPROVAL                                            │
│    Route: /admin/pending-users                               │
│    API: GET /api/admin/pending-users                         │
│    Shows users with approvalStatus: 'pending'                │
│                                                              │
│    Admin clicks "Approve":                                   │
│    API: POST /api/admin/approve-user                         │
│    Updates:                                                  │
│      - isApproved: true                                     │
│      - approvalStatus: 'approved'                           │
│      - approvedBy: adminUserId                              │
│      - approvedAt: new Date()                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. USER CAN NOW LOGIN                                        │
│    Login succeeds → JWT token stored in localStorage         │
│    Redirects to /dashboard                                   │
└─────────────────────────────────────────────────────────────┘
```

**Files Involved:**
- `/signup` page: `src/app/signup/page.tsx`
- Signup API: `src/app/api/auth/signup/route.tsx`
- Login API: `src/app/api/auth/login/route.tsx`
- Admin dashboard: `src/app/admin/pending-users/page.tsx`
- Approval API: `src/app/api/admin/approve-user/route.ts`

**Where to Modify:**
- Auto-approve users: Remove approval check in `src/app/api/auth/login/route.tsx`
- Change default admin credentials: Modify `src/scripts/setup-admin.ts`
- Add email notification on approval: Add nodemailer call in `src/app/api/admin/approve-user/route.ts`

---

### 2. Document Creation & Preparation Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. UPLOAD DOCUMENT                                           │
│    Route: /dashboard/new-meeting                             │
│    User uploads PDF/Word file                                │
│    Component: NewMeetingPdfClient.tsx                        │
│                                                              │
│    API: POST /api/file                                       │
│    - Uses formidable-serverless to parse multipart           │
│    - Validates MIME type (PDF, DOC, DOCX)                    │
│    - Generates safe filename: [sanitized]-[hash].[ext]       │
│    - Saves to public/uploads/                                │
│    - Returns: { filePath, fileName }                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. CREATE MEETING (DRAFT)                                    │
│    API: POST /api/meetings                                   │
│    Creates meeting document with:                            │
│      - title, description                                    │
│      - participants: [{name, email, signed: false}]          │
│      - fileName, filePath                                    │
│      - status: 'Draft'                                       │
│      - organizerId: currentUser._id                          │
│      - createdAt: new Date()                                 │
│                                                              │
│    Redirects to: /prepare/[meetingId]                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. PREPARE FIELDS (DRAG-DROP)                                │
│    Route: /prepare/[id]                                      │
│    Components:                                               │
│      - PdfRenderer.tsx: Renders PDF pages with react-pdf     │
│      - PrepareThumbnails.tsx: Shows page thumbnails          │
│                                                              │
│    User actions:                                             │
│      1. Drag signature/name/date fields onto PDF pages       │
│         (using react-rnd library)                            │
│      2. Assign fields to specific participants               │
│      3. Fields stored with {x, y, page, type, recipientName} │
│                                                              │
│    API: POST /api/meetings/[id]/fields                       │
│    Saves:                                                    │
│      - fields: [PreparedField[]]                             │
│      - status: 'Prepared'                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. SEND FOR SIGNING                                          │
│    User clicks "Send" button                                 │
│                                                              │
│    API: POST /api/meetings/[id]/send                         │
│    Updates:                                                  │
│      1. status: 'Sent'                                       │
│      2. participants[0].isCurrent = true (first signer)      │
│      3. participants[0].order = 1, [1].order = 2, etc.       │
│                                                              │
│    Email sent to first signer:                               │
│      - Subject: "You've been invited to sign [title]"        │
│      - Body: Link to /sign/[meetingId]                       │
│      - Uses nodemailer + Gmail SMTP                          │
└─────────────────────────────────────────────────────────────┘
```

**Files Involved:**
- Upload page: `src/app/dashboard/new-meeting/page.tsx`
- File upload API: `src/app/api/file/route.tsx`
- Create meeting API: `src/app/api/meetings/route.tsx` (POST)
- Prepare page: `src/app/prepare/[id]/page.tsx`
- Save fields API: `src/app/api/meetings/[id]/fields/route.tsx`
- Send API: `src/app/api/meetings/[id]/send/route.tsx`

**Where to Modify:**
- Add more field types: Update `FieldType` in `src/types/meeting.ts`, modify `PdfRenderer.tsx`
- Change file size limit: Modify `maxFileSize` in `src/app/api/file/route.tsx`
- Customize email template: Edit HTML in `src/app/api/meetings/[id]/send/route.tsx`
- Add cloud storage: Replace fs operations in `src/app/api/file/route.tsx` with S3/Cloudinary

---

### 3. Sequential Signing Flow

```
┌─────────────────────────────────────────────────────────────┐
│ SIGNER 1 (isCurrent: true, order: 1)                         │
│                                                              │
│ 1. Receives email with link to /sign/[meetingId]             │
│    Opens signing page                                        │
│                                                              │
│ 2. Route: /sign/[id]/page.tsx                                │
│    Component: SigningView.tsx                                │
│    - Renders PDF with signature fields                       │
│    - Signature options:                                      │
│      a) Draw on canvas (HTML5 canvas → base64 PNG)           │
│      b) Upload image file (converted to base64)              │
│      c) Use saved signature from profile                     │
│                                                              │
│ 3. Submits signature                                         │
│    API: POST /api/meetings/[id]/sign                         │
│    Validation:                                               │
│      - Is user a participant?                                │
│      - participant.isCurrent === true?  ❌ → 403            │
│      - Already signed?  ❌ → 400                            │
│                                                              │
│    Updates:                                                  │
│      - participants[0].signed = true                         │
│      - participants[0].signature = base64Data                │
│      - participants[0].signedAt = new Date()                 │
│      - participants[0].isCurrent = false                     │
│                                                              │
│    If more signers exist:                                    │
│      - participants[1].isCurrent = true                      │
│      - Send email to Signer 2                                │
│    Else:                                                     │
│      - status: 'Completed'                                   │
│      - Send completion email to organizer                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ SIGNER 2 (isCurrent: true, order: 2)                         │
│                                                              │
│ Repeats same process...                                      │
│ Cannot sign until Signer 1 completes                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ ALL SIGNERS COMPLETE                                         │
│                                                              │
│ API: POST /api/meetings/[id]/sign (last signer)              │
│ Updates:                                                     │
│   - status: 'Completed'                                      │
│                                                              │
│ Email to organizer:                                          │
│   - Subject: "Document [title] has been fully signed"        │
│   - Body: Link to view completed document                    │
│                                                              │
│ Document viewable at: /view/[meetingId]                      │
└─────────────────────────────────────────────────────────────┘
```

**Files Involved:**
- Signing page: `src/app/sign/[id]/page.tsx`
- Signing component: `src/app/sign/[id]/SigningView.tsx`
- Sign API: `src/app/api/meetings/[id]/sign/route.tsx`
- View completed: `src/app/view/[id]/page.tsx`

**Where to Modify:**
- Add parallel signing: Remove `isCurrent` check in `src/app/api/meetings/[id]/sign/route.tsx`
- Skip email notifications: Comment out nodemailer calls in sign API
- Add signature validation: Add checks in `src/app/api/meetings/[id]/sign/route.tsx`
- Customize signing UI: Modify `src/app/sign/[id]/SigningView.tsx`

---

### 4. Admin User Management Flow

```
┌─────────────────────────────────────────────────────────────┐
│ ADMIN DASHBOARD ACCESS                                       │
│                                                              │
│ Route: /admin/pending-users                                  │
│ Protected by:                                                │
│   1. Client-side: localStorage.isAdmin === "true"            │
│      (shows link in Sidebar.tsx)                             │
│   2. API-side: verifyAdmin() middleware                      │
│                                                              │
│ Shows users with:                                            │
│   - approvalStatus: 'pending'                                │
│   - Display: name, email, createdAt                          │
│   - Actions: Approve, Reject                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ APPROVE USER                                                 │
│                                                              │
│ API: POST /api/admin/approve-user                            │
│ Auth: verifyAdmin() checks isAdmin in DB                     │
│                                                              │
│ Updates user:                                                │
│   - isApproved: true                                         │
│   - approvalStatus: 'approved'                               │
│   - approvedBy: adminUserId (ObjectId)                       │
│   - approvedAt: new Date()                                   │
│                                                              │
│ User can now login successfully                              │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ ALL USERS MANAGEMENT                                         │
│                                                              │
│ Route: /admin/all-users                                      │
│ API: GET /api/admin/all-users                                │
│                                                              │
│ Shows all users with:                                        │
│   - Name, email, status, approval info                       │
│   - Actions:                                                 │
│     • Suspend/Activate (toggle isActive)                     │
│     • Delete user                                            │
│                                                              │
│ Toggle Status:                                               │
│   API: POST /api/admin/toggle-user-status                    │
│   Updates: isActive = !isActive                              │
│                                                              │
│ Delete User:                                                 │
│   API: DELETE /api/admin/delete-user                         │
│   Removes user document from MongoDB                         │
└─────────────────────────────────────────────────────────────┘
```

**Files Involved:**
- Pending users page: `src/app/admin/pending-users/page.tsx`
- All users page: `src/app/admin/all-users/page.tsx`
- Admin auth helper: `src/lib/admin-auth.ts`
- Pending users API: `src/app/api/admin/pending-users/route.ts`
- Approve API: `src/app/api/admin/approve-user/route.ts`
- All users API: `src/app/api/admin/all-users/route.ts`
- Toggle status API: `src/app/api/admin/toggle-user-status/route.ts`
- Delete user API: `src/app/api/admin/delete-user/route.ts`

**Where to Modify:**
- Add user roles: Add `role` field to User model, update verifyAdmin() to check roles
- Add email on rejection: Modify approval API to send email when rejecting
- Bulk operations: Add batch approve/reject in pending users API
- User activity logs: Add logging collection, track admin actions

---

## Authentication System

### JWT Token Structure

**Issued by:** `POST /api/auth/login`

**Payload:**
```typescript
{
  id: string,        // User._id (ObjectId as string)
  email: string,     // User email
  isAdmin?: boolean  // Only present if user.isAdmin === true
}
```

**Signing:** `jwt.sign(payload, process.env.JWT_SECRET)`

**Storage:**
- Client: `localStorage.setItem("token", token)`
- Client: `localStorage.setItem("isAdmin", isAdmin ? "true" : "false")`

### Authentication Pattern (API Routes)

**Standard Pattern (Duplicated in Every Protected Route):**
```typescript
function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.split(" ")[1] || null;
}

export async function GET/POST(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Now use decoded.id to query database
}
```

**Why Duplicated?**
- Intentional design for independence per route
- Allows route-specific auth logic customization
- Avoids tight coupling with middleware

### Admin Authentication

**Helper:** `src/lib/admin-auth.ts`

```typescript
import { verifyAdmin } from "@/lib/admin-auth";

export async function GET(req: Request) {
  const result = await verifyAdmin(req);
  
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  const adminUserId = result.userId;
  // Proceed with admin-only logic
}
```

**What verifyAdmin() Does:**
1. Extracts JWT token from Authorization header
2. Verifies token with JWT_SECRET
3. Queries MongoDB to confirm `user.isAdmin === true`
4. Returns `{ valid: true, userId }` or `{ valid: false, error }`

**Admin Routes Protected:**
- `/api/admin/pending-users`
- `/api/admin/approve-user`
- `/api/admin/all-users`
- `/api/admin/delete-user`
- `/api/admin/toggle-user-status`

### Client-Side Auth Checks

**Standard Pattern in Pages:**
```typescript
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ProtectedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    
    setLoading(false);
  }, [router]);

  if (loading) return <div>Loading...</div>;

  return <div>Protected Content</div>;
}
```

**Admin-Only Pages:**
```typescript
useEffect(() => {
  const token = localStorage.getItem("token");
  const isAdmin = localStorage.getItem("isAdmin");
  
  if (!token || isAdmin !== "true") {
    router.push("/dashboard");
    return;
  }
  
  setLoading(false);
}, [router]);
```

---

## API Endpoints Reference

### Authentication Endpoints

#### `POST /api/auth/signup`
**Purpose:** Register new user
**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```
**Response:**
```json
{
  "message": "User created successfully. Awaiting admin approval."
}
```
**Logic:**
1. Check if email exists
2. Hash password with bcrypt
3. Create user with `approvalStatus: 'pending'`, `isApproved: false`
4. Return success message

**File:** `src/app/api/auth/signup/route.tsx`

---

#### `POST /api/auth/login`
**Purpose:** Authenticate user and issue JWT
**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```
**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "isAdmin": false
}
```
**Logic:**
1. Find user by email
2. **CHECK: isApproved === true?** (blocks pending users)
3. Verify password with bcrypt
4. Generate JWT with `{id, email, isAdmin}`
5. Return token + isAdmin flag

**File:** `src/app/api/auth/login/route.tsx`

---

### User Endpoints

#### `GET /api/user/profile`
**Purpose:** Get current user profile
**Auth:** Required (Bearer token)
**Response:**
```json
{
  "name": "John Doe",
  "email": "user@example.com",
  "signature": "data:image/png;base64,...",
  "initials": "data:image/png;base64,..."
}
```
**File:** `src/app/api/user/profile/route.tsx`

---

#### `POST /api/user/update-signature`
**Purpose:** Save user signature/initials
**Auth:** Required
**Request Body:**
```json
{
  "signature": "data:image/png;base64,...",
  "initials": "data:image/png;base64,..."
}
```
**File:** `src/app/api/user/update-signature/route.tsx`

---

#### `POST /api/user/change-password`
**Purpose:** Change user password
**Auth:** Required
**Request Body:**
```json
{
  "currentPassword": "old123",
  "newPassword": "new456"
}
```
**Logic:**
1. Verify current password
2. Hash new password
3. Update user.password
**File:** `src/app/api/user/change-password/route.ts`

---

### Meeting Endpoints

#### `GET /api/meetings`
**Purpose:** Get user's meetings (organized + participating)
**Auth:** Required
**Response:**
```json
{
  "organized": [...],
  "participating": [...]
}
```
**Logic:**
1. Query meetings where `organizerId` matches (using getUserIdVariants)
2. Query meetings where `participants.email` matches
3. Return both arrays
**File:** `src/app/api/meetings/route.tsx`

---

#### `POST /api/meetings`
**Purpose:** Create new meeting (draft)
**Auth:** Required
**Request Body:**
```json
{
  "title": "Contract Agreement",
  "description": "Annual contract",
  "participants": [
    {"name": "Alice", "email": "alice@example.com"},
    {"name": "Bob", "email": "bob@example.com"}
  ],
  "fileName": "contract.pdf",
  "filePath": "/uploads/contract-abc123.pdf"
}
```
**Response:**
```json
{
  "meetingId": "60d5ec49f1b2c8b1f8e4e1a1"
}
```
**Logic:**
1. Create meeting with status: 'Draft'
2. Set organizerId to current user
3. Initialize participants with signed: false
**File:** `src/app/api/meetings/route.tsx`

---

#### `GET /api/meetings/[id]`
**Purpose:** Get meeting details
**Auth:** Required
**Logic:**
- Verify user is organizer or participant
**File:** `src/app/api/meetings/[id]/route.tsx`

---

#### `POST /api/meetings/[id]/fields`
**Purpose:** Save prepared signature fields
**Auth:** Required
**Request Body:**
```json
{
  "fields": [
    {
      "id": "field-1",
      "type": "signature",
      "x": 100,
      "y": 200,
      "page": 1,
      "recipientName": "Alice"
    }
  ]
}
```
**Logic:**
1. Update meeting.fields
2. Update status to 'Prepared'
**File:** `src/app/api/meetings/[id]/fields/route.tsx`

---

#### `POST /api/meetings/[id]/send`
**Purpose:** Send meeting for signing
**Auth:** Required
**Logic:**
1. Validate fields exist
2. Set participant orders (1, 2, 3...)
3. Set first participant.isCurrent = true
4. Update status to 'Sent'
5. Send email to first signer
**File:** `src/app/api/meetings/[id]/send/route.tsx`

---

#### `POST /api/meetings/[id]/sign`
**Purpose:** Submit signature
**Auth:** Required
**Request Body:**
```json
{
  "signature": "data:image/png;base64,...",
  "signaturePositions": [...]
}
```
**Logic:**
1. Validate signature format (must start with 'data:image/')
2. Find participant by email
3. **CHECK: participant.isCurrent === true?**
4. **CHECK: !participant.signed?**
5. Update participant: signed=true, signature, signedAt
6. Set participant.isCurrent = false
7. If next participant exists:
   - Set next.isCurrent = true
   - Send email to next signer
8. Else:
   - Set status = 'Completed'
   - Send completion email to organizer
**File:** `src/app/api/meetings/[id]/sign/route.tsx`

---

#### `GET /api/meetings/[id]/pdf`
**Purpose:** Get signed PDF (with signatures applied)
**Auth:** Required
**Response:** PDF file
**Logic:**
1. Load original PDF with pdf-lib
2. For each signed participant:
   - Embed signature image
   - Place at field coordinates
3. Return modified PDF bytes
**File:** `src/app/api/meetings/[id]/pdf/route.tsx`

---

#### `GET /api/meetings/[id]/download`
**Purpose:** Download signed PDF
**Auth:** Required
**Response:** PDF file with download headers
**File:** `src/app/api/meetings/[id]/download/route.tsx`

---

### File Endpoints

#### `POST /api/file`
**Purpose:** Upload PDF/Word file
**Auth:** Required
**Request:** multipart/form-data with 'file' field
**Response:**
```json
{
  "fileName": "contract.pdf",
  "filePath": "/uploads/contract-abc123.pdf"
}
```
**Logic:**
1. Parse multipart with formidable-serverless
2. Validate MIME type (PDF, DOC, DOCX)
3. Generate safe filename: `[sanitized-base]-[crypto-hash].[ext]`
4. Save to `public/uploads/`
5. Return paths
**File:** `src/app/api/file/route.tsx`
**Important:** Requires `export const runtime = "nodejs"`

---

#### `GET /api/uploads/[file]`
**Purpose:** Serve uploaded files
**Auth:** None (public access)
**Response:** File stream
**Logic:**
- Read from `public/uploads/[file]`
- Set Content-Type header
- Stream file
**File:** `src/app/api/uploads/[file]/route.ts`

---

### Admin Endpoints

#### `GET /api/admin/pending-users`
**Purpose:** Get users awaiting approval
**Auth:** Admin only (verifyAdmin)
**Response:**
```json
{
  "users": [
    {
      "_id": "...",
      "name": "John",
      "email": "john@example.com",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "approvalStatus": "pending"
    }
  ]
}
```
**File:** `src/app/api/admin/pending-users/route.ts`

---

#### `POST /api/admin/approve-user`
**Purpose:** Approve user registration
**Auth:** Admin only
**Request Body:**
```json
{
  "userId": "60d5ec49f1b2c8b1f8e4e1a1"
}
```
**Logic:**
1. Update user:
   - isApproved: true
   - approvalStatus: 'approved'
   - approvedBy: adminUserId
   - approvedAt: new Date()
2. Return success
**File:** `src/app/api/admin/approve-user/route.ts`

---

#### `GET /api/admin/all-users`
**Purpose:** Get all users (except current admin)
**Auth:** Admin only
**Response:**
```json
{
  "users": [...]
}
```
**File:** `src/app/api/admin/all-users/route.ts`

---

#### `POST /api/admin/toggle-user-status`
**Purpose:** Suspend/activate user
**Auth:** Admin only
**Request Body:**
```json
{
  "userId": "..."
}
```
**Logic:**
- Toggle isActive flag
**File:** `src/app/api/admin/toggle-user-status/route.ts`

---

#### `DELETE /api/admin/delete-user`
**Purpose:** Delete user account
**Auth:** Admin only
**Request Body:**
```json
{
  "userId": "..."
}
```
**File:** `src/app/api/admin/delete-user/route.ts`

---

## File Structure & Responsibilities

### Core Library Files

#### `src/lib/mongodb.tsx`
**Purpose:** MongoDB connection singleton
**Exports:** `clientPromise` (default), `connectToDatabase()`
**Pattern:**
```typescript
import clientPromise from "@/lib/mongodb";

const client = await clientPromise;
const db = client.db("e_sign_db");
const collection = db.collection("users");
```
**Why Singleton?**
- Prevents connection pool exhaustion in dev hot-reload
- Reuses connection across all API routes
- Global caching: `(global as any)._mongoClientPromise`

**NEVER DO:**
```typescript
// ❌ Don't create new MongoClient instances
const client = new MongoClient(uri);
```

---

#### `src/lib/auth-helpers.ts`
**Purpose:** Handle mixed ObjectId/string format for organizerId
**Exports:** `getUserIdVariants(userId: string)`
**Returns:**
```typescript
{
  organizerIdQuery: {
    $in: [ObjectId(userId), userId]
  }
}
```
**Usage:**
```typescript
import { getUserIdVariants } from "@/lib/auth-helpers";

const { organizerIdQuery } = getUserIdVariants(decoded.id);
const meetings = await db.collection("meetings").find({
  organizerId: organizerIdQuery
}).toArray();
```

**Why Needed?**
- organizerId stored inconsistently (some as ObjectId, some as string)
- Query both formats to avoid missing results
- DO NOT use plain `ObjectId(userId)` for organizerId queries

---

#### `src/lib/admin-auth.ts`
**Purpose:** Admin authentication verification
**Exports:** `verifyAdmin(req: Request)`
**Returns:**
```typescript
{ valid: true, userId: string } | 
{ valid: false, error: string }
```
**Usage:**
```typescript
import { verifyAdmin } from "@/lib/admin-auth";

export async function GET(req: Request) {
  const result = await verifyAdmin(req);
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  // Proceed with admin logic
}
```

---

### Type Definitions

#### `src/models/user.tsx`
**Purpose:** User interface definition
```typescript
export interface User {
  _id?: ObjectId;
  email: string;
  password: string;
  name?: string;
  signature?: string;
  initials?: string;
  isAdmin?: boolean;
  isApproved?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvedBy?: ObjectId;
  approvedAt?: Date;
  isActive?: boolean;
  createdAt: Date;
}
```

---

#### `src/types/meeting.ts`
**Purpose:** Meeting-related type definitions
```typescript
export type FieldType = "signature" | "name" | "date";

export type PreparedField = {
  id: string;
  type: FieldType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  page?: number;
  recipientName?: string;
};

export type Participant = {
  name: string;
  email: string;
  signed: boolean;
  signature?: string;
  signedAt?: Date;
  order?: number;
  isCurrent?: boolean;
};

export type MeetingDoc = {
  _id?: string;
  title: string;
  date?: string;
  description: string;
  participants: Participant[];
  fileName: string;
  filePath: string;
  status: "Prepared" | "Draft" | "Sent" | "Completed" | string;
  organizerId: string;
  fields?: PreparedField[];
  createdAt: Date;
  updatedAt?: Date;
};
```

---

### Component Files

#### `src/components/Sidebar.tsx`
**Purpose:** Navigation sidebar
**Features:**
- Links to Dashboard, Documents, New Meeting, Settings
- Shows Admin link only if `localStorage.isAdmin === "true"`
- Logout button (clears localStorage, redirects to /login)
- Active route highlighting

**Admin Link Logic:**
```typescript
const [isAdmin, setIsAdmin] = useState(false);

useEffect(() => {
  setIsAdmin(localStorage.getItem("isAdmin") === "true");
}, []);

{isAdmin && (
  <Link href="/admin/pending-users">Admin Panel</Link>
)}
```

---

#### `src/components/SuccessModal.tsx`
**Purpose:** Reusable success notification modal
**Props:**
```typescript
{
  isOpen: boolean;
  message: string;
  onClose: () => void;
}
```
**Usage:**
```typescript
<SuccessModal
  isOpen={showSuccess}
  message="Document signed successfully!"
  onClose={() => setShowSuccess(false)}
/>
```

---

### Page Components

#### Document Preparation Pages

**`src/app/dashboard/new-meeting/NewMeetingPdfClient.tsx`**
- Upload file form
- Add participants (name/email)
- Create draft meeting
- Calls: `POST /api/file`, `POST /api/meetings`

**`src/app/prepare/[id]/PdfRenderer.tsx`**
- Renders PDF with react-pdf
- Drag-drop field placement (react-rnd)
- Field types: signature, name, date
- Assign fields to participants
- Saves via `POST /api/meetings/[id]/fields`

**`src/app/prepare/[id]/PrepareThumbnails.tsx`**
- Shows page thumbnails
- Click to jump to page
- Visual navigation aid

---

#### Signing Pages

**`src/app/sign/[id]/SigningView.tsx`**
- Canvas-based signature drawing
- Image upload for signature
- Use saved signature from profile
- Submit via `POST /api/meetings/[id]/sign`

**Key Methods:**
- `handleDrawSignature()`: Canvas → base64 PNG
- `handleUploadSignature()`: File → base64
- `handleSubmit()`: POST signature to API

---

#### Admin Pages

**`src/app/admin/pending-users/page.tsx`**
- Lists users with approvalStatus: 'pending'
- Approve/Reject buttons
- Calls: `GET /api/admin/pending-users`, `POST /api/admin/approve-user`

**`src/app/admin/all-users/page.tsx`**
- Lists all users (except current admin)
- Suspend/Activate toggle
- Delete user button
- Calls: `GET /api/admin/all-users`, `POST /api/admin/toggle-user-status`, `DELETE /api/admin/delete-user`

---

## Email Notification System

### Email Configuration

**SMTP Settings:**
```typescript
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});
```

**Environment Variables Required:**
- `EMAIL_USER`: Gmail address (e.g., `noreply@yourapp.com`)
- `EMAIL_PASSWORD`: Gmail app password (NOT regular password)
- `NEXT_PUBLIC_APP_URL`: Base URL for links (e.g., `http://localhost:3000`)

**Gmail Setup:**
1. Enable 2-factor authentication
2. Generate app password at https://myaccount.google.com/apppasswords
3. Use app password in EMAIL_PASSWORD

---

### Email Templates

#### 1. First Signer Notification
**Sent by:** `POST /api/meetings/[id]/send`
**Recipient:** First participant (order: 1)
**Subject:** `You've been invited to sign [title]`
**Body:**
```html
<p>Hi [name],</p>
<p>You have been invited to sign the document titled "<strong>[title]</strong>".</p>
<p><a href="[APP_URL]/sign/[meetingId]">Click here to sign the document</a></p>
```

---

#### 2. Next Signer Notification
**Sent by:** `POST /api/meetings/[id]/sign` (after previous signer completes)
**Recipient:** Next participant in sequence
**Subject:** `Your turn to sign [title]`
**Body:**
```html
<p>Hi [name],</p>
<p>The document "[title]" is ready for your signature.</p>
<p><a href="[APP_URL]/sign/[meetingId]">Click here to sign</a></p>
```

---

#### 3. Completion Notification
**Sent by:** `POST /api/meetings/[id]/sign` (last signer)
**Recipient:** Document organizer
**Subject:** `Document [title] has been fully signed`
**Body:**
```html
<p>Hi,</p>
<p>All participants have signed the document "<strong>[title]</strong>".</p>
<p><a href="[APP_URL]/view/[meetingId]">View completed document</a></p>
```

---

### Email Sending Pattern

**CRITICAL: Database First, Email Second**
```typescript
// ✅ CORRECT: Update DB first
await db.collection("meetings").updateOne(
  { _id: meetingId },
  { $set: { status: 'Sent', ... } }
);

// THEN send email
await transporter.sendMail({ ... });
```

**Why?**
- If email fails, database state is still correct
- Prevents inconsistencies where email sent but DB not updated
- Email failures can be retried/logged without data loss

---

### Customizing Email Templates

**Location:** Inline HTML in route handlers
- Send invite: `src/app/api/meetings/[id]/send/route.tsx`
- Next signer: `src/app/api/meetings/[id]/sign/route.tsx`
- Completion: `src/app/api/meetings/[id]/sign/route.tsx`

**To Use External Templates:**
1. Create template files in `src/emails/`
2. Use template engine (handlebars, ejs)
3. Import and compile in route handlers

**Example:**
```typescript
import fs from "fs/promises";
import Handlebars from "handlebars";

const template = await fs.readFile("src/emails/invite.hbs", "utf-8");
const compiled = Handlebars.compile(template);
const html = compiled({ name, title, link });

await transporter.sendMail({ html });
```

---

## Configuration & Environment

### Required Environment Variables

**`.env.local` File:**
```bash
# MongoDB Connection
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/e_sign_db?retryWrites=true&w=majority

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-secret-key-here

# Gmail SMTP
EMAIL_USER=noreply@yourapp.com
EMAIL_PASSWORD=your-app-password

# Base URL (for email links)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Security Best Practices

**JWT Secret:**
- Generate strong random key: `openssl rand -base64 32`
- NEVER commit to Git
- Rotate periodically in production

**Password Hashing:**
- Uses bcryptjs with default salt rounds (10)
- Increase salt rounds for higher security:
```typescript
const hashedPassword = await bcrypt.hash(password, 12);
```

**File Upload Security:**
- Validates MIME types (PDF, DOC, DOCX only)
- Sanitizes filenames (removes special chars)
- Adds crypto hash to prevent collisions/overwrites
- Location: `src/app/api/file/route.tsx`

**To Add File Size Limit:**
```typescript
// In src/app/api/file/route.tsx
const form = new formidable.IncomingForm({
  maxFileSize: 10 * 1024 * 1024, // 10MB
});
```

---

### Admin Setup

**Initial Admin Creation:**
```bash
npm run setup:admin
```

**Script:** `src/scripts/setup-admin.ts`
**Creates:**
- Email: `admin@esign.com`
- Password: `Admin@123`
- isAdmin: `true`
- isApproved: `true`

**IMPORTANT: Change password after first login!**
- Go to `/settings`
- Use "Change Password" form

---

### Database Indexes (Recommended)

**Run in MongoDB shell:**
```javascript
use e_sign_db;

// Users collection
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ isAdmin: 1 });
db.users.createIndex({ approvalStatus: 1 });

// Meetings collection
db.meetings.createIndex({ organizerId: 1 });
db.meetings.createIndex({ "participants.email": 1 });
db.meetings.createIndex({ status: 1 });
db.meetings.createIndex({ createdAt: -1 });
```

---

## Common Modification Scenarios

### 1. Change Email Provider (e.g., SendGrid, AWS SES)

**Files to Modify:**
- All route files with `createTransporter()`
- `src/app/api/meetings/[id]/send/route.tsx`
- `src/app/api/meetings/[id]/sign/route.tsx`

**Example (SendGrid):**
```typescript
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

async function sendEmail(to: string, subject: string, html: string) {
  await sgMail.send({
    to,
    from: process.env.EMAIL_FROM!,
    subject,
    html,
  });
}
```

---

### 2. Add Cloud File Storage (S3, Cloudinary)

**Files to Modify:**
- `src/app/api/file/route.tsx` (upload)
- `src/app/api/uploads/[file]/route.ts` (serve files)

**Example (AWS S3):**
```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: "us-east-1" });

// In file upload handler
await s3.send(new PutObjectCommand({
  Bucket: process.env.S3_BUCKET,
  Key: `uploads/${fileName}`,
  Body: fileBuffer,
  ContentType: mimeType,
}));

// Store S3 URL in meeting.filePath
const filePath = `https://${bucket}.s3.amazonaws.com/uploads/${fileName}`;
```

---

### 3. Add More Field Types

**Files to Modify:**
1. `src/types/meeting.ts`
```typescript
export type FieldType = "signature" | "name" | "date" | "text" | "checkbox";
```

2. `src/app/prepare/[id]/PdfRenderer.tsx`
```typescript
const fieldTypes = ["signature", "name", "date", "text", "checkbox"];

// Add rendering logic for new types
```

3. `src/app/api/meetings/[id]/pdf/route.tsx`
```typescript
// Add pdf-lib logic to embed new field types
if (field.type === "text") {
  page.drawText(field.value, { x, y, size: 12 });
}
```

---

### 4. Enable Parallel Signing (Non-Sequential)

**Files to Modify:**
1. `src/app/api/meetings/[id]/send/route.tsx`
```typescript
// Remove order assignment, set ALL participants isCurrent = true
participants.forEach((p: any) => {
  p.isCurrent = true;
});

// Send emails to ALL participants
for (const participant of participants) {
  await transporter.sendMail({ ... });
}
```

2. `src/app/api/meetings/[id]/sign/route.tsx`
```typescript
// Remove isCurrent check
// if (!participant.isCurrent) { ... } ❌ DELETE THIS

// After signing, check if ALL signed
const allSigned = meeting.participants.every((p: any) => p.signed);
if (allSigned) {
  // Mark as completed
}
```

---

### 5. Add Email Notification on User Approval

**File:** `src/app/api/admin/approve-user/route.ts`

```typescript
// After updating user in DB
await db.collection("users").updateOne(...);

// Send email to user
const transporter = createTransporter();
await transporter.sendMail({
  to: user.email,
  subject: "Your account has been approved",
  html: `
    <p>Hi ${user.name},</p>
    <p>Your account has been approved! You can now login.</p>
    <a href="${process.env.NEXT_PUBLIC_APP_URL}/login">Login here</a>
  `,
});
```

---

### 6. Add User Roles (Beyond Admin/User)

**Files to Modify:**
1. `src/models/user.tsx`
```typescript
export interface User {
  ...
  role?: 'admin' | 'manager' | 'user';
}
```

2. `src/app/api/auth/login/route.tsx`
```typescript
const token = jwt.sign(
  { id: user._id, email: user.email, role: user.role },
  JWT_SECRET
);
```

3. Create role-specific middleware:
```typescript
// src/lib/role-auth.ts
export async function verifyRole(req: Request, allowedRoles: string[]) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (!allowedRoles.includes(decoded.role)) {
    return { valid: false, error: "Insufficient permissions" };
  }
  return { valid: true, userId: decoded.id };
}
```

---

### 7. Add Audit Logs

**Create Collection:** `audit_logs`
```typescript
{
  userId: ObjectId,
  action: string,        // "document_signed", "user_approved", etc.
  targetId: ObjectId,    // Meeting ID, User ID, etc.
  metadata: {},
  timestamp: Date
}
```

**Example Usage:**
```typescript
// In src/app/api/meetings/[id]/sign/route.tsx
await db.collection("audit_logs").insertOne({
  userId: new ObjectId(decoded.id),
  action: "document_signed",
  targetId: new ObjectId(meetingId),
  metadata: { meetingTitle: meeting.title },
  timestamp: new Date(),
});
```

---

### 8. Remove User Approval Requirement

**File:** `src/app/api/auth/login/route.tsx`

```typescript
// Comment out or remove this block
// if (!user.isApproved) {
//   return NextResponse.json(
//     { error: "Your account is pending approval" },
//     { status: 403 }
//   );
// }
```

**File:** `src/app/api/auth/signup/route.tsx`
```typescript
// Set user as auto-approved
const newUser = {
  email,
  password: hashedPassword,
  name,
  isApproved: true,              // Changed from false
  approvalStatus: 'approved',    // Changed from 'pending'
  createdAt: new Date(),
};
```

---

### 9. Add PDF Password Protection

**File:** `src/app/api/meetings/[id]/download/route.tsx`

```typescript
import { PDFDocument, StandardFonts } from 'pdf-lib';

// After loading PDF
const pdfDoc = await PDFDocument.load(fileBuffer);

// Encrypt PDF
pdfDoc.encrypt({
  userPassword: 'user123',
  ownerPassword: 'owner123',
  permissions: {
    printing: 'highResolution',
    modifying: false,
    copying: false,
  },
});

const pdfBytes = await pdfDoc.save();
```

---

### 10. Add Multi-Language Support

**Files to Modify:**
1. Install i18n library: `npm install next-i18next`

2. Create translation files:
```
public/
  locales/
    en/
      common.json
    es/
      common.json
```

3. Wrap components:
```typescript
import { useTranslation } from 'next-i18next';

export default function Component() {
  const { t } = useTranslation('common');
  return <h1>{t('welcome')}</h1>;
}
```

4. Update email templates to use user's language preference

---

## Troubleshooting Guide

### Common Issues

#### 1. "Pending approval" on login after admin approval
**Cause:** Browser cache or token still contains old data
**Solution:**
- Clear localStorage: `localStorage.clear()`
- Logout and login again
- Check DB: Verify `isApproved: true` in users collection

---

#### 2. Files not uploading / 413 Payload Too Large
**Cause:** Next.js body size limit or missing runtime config
**Solution:**
- Add to `src/app/api/file/route.tsx`:
```typescript
export const runtime = "nodejs"; // Required!

export const config = {
  api: {
    bodyParser: false,
  },
};
```

---

#### 3. MongoDB connection errors in development
**Cause:** Too many connections from hot-reload
**Solution:**
- Verify singleton pattern in `src/lib/mongodb.tsx`
- Check global caching is enabled
- Restart dev server: `npm run dev`

---

#### 4. Signature not appearing on PDF
**Cause:** Coordinates off-page or pdf-lib embedding error
**Solution:**
- Check field coordinates (x, y) are within page bounds
- Verify signature is valid base64 data URL
- Check `src/app/api/meetings/[id]/pdf/route.tsx` for errors

---

#### 5. Emails not sending
**Cause:** Gmail app password or SMTP config
**Solution:**
- Verify EMAIL_USER and EMAIL_PASSWORD in .env.local
- Use Gmail app password (NOT regular password)
- Enable "Less secure app access" (if using regular password)
- Check Gmail SMTP limits (500 emails/day for free accounts)

---

#### 6. "Invalid token" errors
**Cause:** JWT_SECRET mismatch or token expired
**Solution:**
- Verify JWT_SECRET is same across all environments
- Check token expiration (currently no expiry set)
- Clear localStorage and login again

---

#### 7. Cannot sign document (403 Forbidden)
**Cause:** Not current signer or already signed
**Solution:**
- Check `participant.isCurrent === true` in DB
- Verify signing order is correct
- Check `participant.signed === false`

---

## Performance Optimization Tips

### 1. Database Query Optimization
- Add indexes on frequently queried fields
- Use projection to limit returned fields:
```typescript
const meetings = await db.collection("meetings")
  .find({ organizerId })
  .project({ title: 1, status: 1, createdAt: 1 }) // Only return these fields
  .toArray();
```

---

### 2. File Upload Optimization
- Implement file size limits
- Add client-side file type validation
- Use streaming for large files:
```typescript
const stream = fs.createReadStream(filePath);
res.setHeader('Content-Type', 'application/pdf');
stream.pipe(res);
```

---

### 3. PDF Rendering Optimization
- Lazy load PDF pages (only render visible pages)
- Cache rendered pages in client state
- Use lower DPI for thumbnails
```typescript
<Document>
  <Page pageNumber={1} scale={0.5} /> {/* Lower scale for thumbnails */}
</Document>
```

---

### 4. API Response Optimization
- Paginate meeting lists:
```typescript
const skip = (page - 1) * limit;
const meetings = await collection.find().skip(skip).limit(limit);
```
- Return minimal data (avoid sending entire file contents)

---

### 5. Client-Side Caching
- Cache user profile in localStorage
- Implement SWR or React Query for data fetching
- Debounce search inputs

---

## Testing Recommendations

### 1. Unit Testing
**Test Files:**
- Auth helpers: `src/lib/auth-helpers.test.ts`
- Admin verification: `src/lib/admin-auth.test.ts`

**Example:**
```typescript
import { getUserIdVariants } from "@/lib/auth-helpers";

test("returns both ObjectId and string format", () => {
  const result = getUserIdVariants("507f1f77bcf86cd799439011");
  expect(result.organizerIdQuery.$in).toHaveLength(2);
});
```

---

### 2. Integration Testing
**Test Scenarios:**
- Complete signup → approval → login flow
- Document upload → prepare → send → sign flow
- Email sending (use test SMTP like Mailtrap)

---

### 3. E2E Testing (Playwright/Cypress)
**Test Scripts:**
```typescript
test("Complete document signing flow", async ({ page }) => {
  await page.goto("/login");
  await page.fill('[name="email"]', 'user@test.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  await page.goto("/dashboard/new-meeting");
  // ... continue flow
});
```

---

## Deployment Checklist

### Production Environment Setup

**1. Environment Variables**
```bash
MONGODB_URI=mongodb+srv://...
JWT_SECRET=[strong-random-secret]
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASSWORD=[gmail-app-password]
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NODE_ENV=production
```

**2. Database**
- Create production MongoDB cluster
- Set up indexes (see Database Indexes section)
- Configure IP whitelist
- Enable authentication
- Set up automated backups

**3. File Storage**
- Set up cloud storage (S3, Cloudinary)
- Configure CORS policies
- Set up CDN for file serving

**4. Security**
- Enable HTTPS (SSL certificate)
- Set up rate limiting
- Configure CORS properly
- Enable MongoDB connection encryption
- Implement CSP headers

**5. Monitoring**
- Set up error tracking (Sentry)
- Configure logging (Winston, Pino)
- Monitor database performance
- Set up uptime monitoring

**6. Build & Deploy**
```bash
npm run build
npm start
```

**7. Post-Deployment**
- Run `npm run setup:admin`
- Change admin password immediately
- Test complete workflows
- Monitor logs for errors

---

## Summary of Key Design Patterns

1. **JWT Authentication**: Per-route validation with duplicated `getBearerToken()`
2. **MongoDB Singleton**: Single global connection via `clientPromise`
3. **Mixed ObjectId Handling**: Use `getUserIdVariants()` for organizerId queries
4. **Sequential Signing**: Enforced via `isCurrent` flag and `order` field
5. **Email-First Workflow**: Database update → then email notification
6. **Client-Side Heavy**: All pages are client components with useEffect auth checks
7. **Local File Storage**: Sanitized names + crypto hash in `public/uploads/`
8. **Admin Verification**: Separate helper function for admin-only routes

---

## Additional Resources

- **Next.js Docs**: https://nextjs.org/docs
- **MongoDB Node Driver**: https://mongodb.github.io/node-mongodb-native/
- **pdf-lib Documentation**: https://pdf-lib.js.org/
- **Nodemailer Guide**: https://nodemailer.com/
- **JWT Best Practices**: https://jwt.io/introduction

---

**Document Version:** 1.0  
**Last Updated:** February 4, 2026  
**Maintainer:** Development Team
