# Auto Hub Server - API Documentation

## Base URL
```
http://localhost:5000/api/v1
```

---

## Authentication Endpoints

### 1. Initiate Google OAuth
Start the Google authentication flow.

```
GET /auth/google
```

**Response:** Redirects to Google login page

---

### 2. Google OAuth Callback
Handles the callback from Google after authentication.

```
GET /auth/google/callback
```

**Response:** Redirects to frontend with cookies set:
- `accessToken` - JWT access token (15 min)
- `refreshToken` - JWT refresh token (7 days)
- `fp` - Fingerprint for token binding

**Redirect URLs:**
- Success: `{FRONTEND_URL}/auth/success`
- Error: `{FRONTEND_URL}/login?error={error_type}`

---

### 3. Check Auth Status
Check if user is currently authenticated.

```
GET /auth/status
```

**Response (Authenticated):**
```json
{
  "status": "success",
  "data": {
    "isAuthenticated": true,
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "User Name",
      "avatar": "https://...",
      "role": "buyer"
    }
  }
}
```

**Response (Not Authenticated):**
```json
{
  "status": "success",
  "data": {
    "isAuthenticated": false
  }
}
```

---

### 4. Refresh Token
Get a new access token using the refresh token.

```
POST /auth/refresh
```

**Requires:** `refreshToken` and `fp` cookies

**Response:**
```json
{
  "status": "success",
  "message": "Token refreshed successfully"
}
```

**Error Responses:**
| Status | Message |
|--------|---------|
| 401 | No refresh token provided |
| 401 | Refresh token expired |
| 401 | Invalid refresh token |
| 429 | Too many token refresh attempts |

---

### 5. Get Current User Profile
Get the authenticated user's profile.

```
GET /auth/me
```

**Requires:** Authentication (accessToken cookie)

**Response:**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "User Name",
      "avatar": "https://...",
      "role": "buyer",
      "isEmailVerified": true,
      "lastLogin": "2024-01-07T10:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

---

### 6. Update User Profile
Update the authenticated user's profile.

```
PATCH /auth/me
```

**Requires:** Authentication (accessToken cookie)

**Request Body:**
```json
{
  "name": "New Name",
  "phone": "+91-1234567890",
  "addresses": [
    {
      "label": "Home",
      "street": "123 Main St",
      "city": "Mumbai",
      "state": "Maharashtra",
      "postalCode": "400001",
      "country": "India",
      "isDefault": true
    }
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "New Name",
      "avatar": "https://...",
      "phone": "+91-1234567890",
      "addresses": [...],
      "role": "buyer"
    }
  }
}
```

---

### 7. Logout (Single Device)
Log out from the current device.

```
POST /auth/logout
```

**Requires:** Authentication (accessToken cookie)

**Response:**
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

---

### 8. Logout (All Devices)
Log out from all devices.

```
POST /auth/logout-all
```

**Requires:** Authentication (accessToken cookie)

**Response:**
```json
{
  "status": "success",
  "message": "Logged out from all devices"
}
```

---

## Health Check

### Server Health
Check if the server is running.

```
GET /health
```

**Response:**
```json
{
  "status": "success",
  "message": "Server is running",
  "timestamp": "2024-01-07T10:00:00.000Z",
  "environment": "development",
  "uptime": 3600.5
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "status": "fail" | "error",
  "message": "Error description"
}
```

### Common Error Codes

| Status | Meaning |
|--------|---------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Server Error - Internal error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| General API | 100 requests / 15 min |
| Auth endpoints | 10 requests / 15 min |
| Token refresh | 5 requests / 1 min |

---

## Cookie Configuration

| Cookie | HttpOnly | Secure (Prod) | SameSite | Max Age |
|--------|----------|---------------|----------|---------|
| accessToken | ✅ | ✅ | Lax | 15 min |
| refreshToken | ✅ | ✅ | Strict | 7 days |
| fp | ❌ | ✅ | Strict | 7 days |
