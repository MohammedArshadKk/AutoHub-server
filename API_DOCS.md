# Auto Hub API Documentation

**Base URL:** `http://localhost:5000/api/v1`

---

## Authentication Systems

| User Type | Auth Method | Cookie Prefix |
|-----------|-------------|---------------|
| Buyer | Google OAuth | `accessToken`, `refreshToken` |
| Seller | Email/Password | `sellerAccessToken`, `sellerRefreshToken` |
| Admin | Email/Password | `adminAccessToken`, `adminRefreshToken` |

---

## Buyer Authentication

### Initiate Google OAuth
```
GET /auth/google
```
Redirects to Google login page.

### Google Callback
```
GET /auth/google/callback
```
Handles OAuth callback, sets cookies, redirects to frontend.

### Refresh Token
```
POST /auth/refresh
```

### Logout
```
POST /auth/logout
```
**Requires:** Buyer authentication

### Get Profile
```
GET /auth/me
```
**Requires:** Buyer authentication

---

## Seller Authentication

### Register
```
POST /seller/auth/register
```
**Body:**
```json
{
  "email": "seller@example.com",
  "password": "password123",
  "businessName": "Auto Parts Store",
  "ownerName": "John Doe",
  "phone": "+91-9876543210",
  "businessType": "Individual"
}
```
**Response:** `201 Created`

### Login
```
POST /seller/auth/login
```
**Body:**
```json
{
  "email": "seller@example.com",
  "password": "password123"
}
```

### Refresh Token
```
POST /seller/auth/refresh
```

### Logout
```
POST /seller/auth/logout
```
**Requires:** Seller authentication

### Get Profile
```
GET /seller/auth/me
```
**Requires:** Seller authentication

### Update Profile
```
PATCH /seller/auth/me
```
**Requires:** Seller authentication
**Body:**
```json
{
  "businessName": "Updated Store Name",
  "phone": "+91-9876543210",
  "description": "Best auto parts in town"
}
```

### Submit KYC
```
PATCH /seller/auth/kyc
```
**Requires:** Seller authentication
**Body:**
```json
{
  "kyc": {
    "idType": "PAN",
    "idNumber": "ABCDE1234F",
    "gstin": "22AAAAA0000A1Z5"
  },
  "address": {
    "street": "123 Main St",
    "city": "Mumbai",
    "state": "Maharashtra",
    "postalCode": "400001"
  }
}
```

---

## Admin Authentication

### Login
```
POST /admin/auth/login
```
**Body:**
```json
{
  "email": "admin@autohub.com",
  "password": "adminpassword"
}
```

### Refresh Token
```
POST /admin/auth/refresh
```

### Logout
```
POST /admin/auth/logout
```
**Requires:** Admin authentication

### Get Profile
```
GET /admin/auth/me
```
**Requires:** Admin authentication

### Create Admin (Super Admin only)
```
POST /admin/auth/create
```
**Requires:** Super Admin authentication
**Body:**
```json
{
  "email": "newadmin@autohub.com",
  "password": "securepassword",
  "name": "New Admin",
  "permissions": ["products", "orders", "sellers"]
}
```

---

## Products - Public

### Get All Products
```
GET /products
```
**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (max: 50, default: 20) |
| category | string | Filter by category |
| condition | string | Filter by condition |
| minPrice | number | Minimum price |
| maxPrice | number | Maximum price |
| make | string | Filter by vehicle make |
| model | string | Filter by vehicle model |
| year | number | Filter by vehicle year |
| search | string | Text search |
| brand | string | Filter by brand |
| inStock | boolean | Only in-stock items |
| sort | string | Sort field (default: -createdAt) |

**Response:**
```json
{
  "status": "success",
  "results": 20,
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8,
    "hasNext": true,
    "hasPrev": false
  },
  "data": {
    "products": [...]
  }
}
```

### Get Single Product
```
GET /products/:id
```

---

## Products - Seller

### Get My Products
```
GET /products/seller/my-products
```
**Requires:** Seller authentication
**Query:** `status`, `search`, `page`, `limit`

### Create Product
```
POST /products/seller
```
**Requires:** Verified Seller
**Body:**
```json
{
  "name": "Brake Pad Set",
  "description": "High-quality brake pads for Honda City...",
  "partNumber": "BP-HC-2020",
  "images": ["https://..."],
  "price": 2500,
  "originalPrice": 3000,
  "category": "Brakes",
  "condition": "New",
  "stock": 10,
  "compatibleVehicles": [
    {
      "year": 2020,
      "make": "Honda",
      "model": "City"
    }
  ],
  "brand": "Bosch",
  "warranty": "1 year"
}
```
**Response:** `201 Created` (status: PENDING_APPROVAL)

### Update Product
```
PATCH /products/seller/:id
```
**Requires:** Seller authentication (own products only)
**Note:** If product was ACTIVE, it goes back to PENDING_APPROVAL

### Delete Product
```
DELETE /products/seller/:id
```
**Requires:** Seller authentication (own products only)

---

## Products - Admin

### Get Pending Products
```
GET /products/admin/pending
```
**Requires:** Admin with 'products' permission

### Create Product (Direct Publish)
```
POST /products/admin
```
**Requires:** Admin with 'products' permission
**Note:** Products created by admin are immediately ACTIVE

### Update Any Product
```
PATCH /products/admin/:id
```
**Requires:** Admin with 'products' permission

### Delete Any Product
```
DELETE /products/admin/:id
```
**Requires:** Admin with 'products' permission

### Approve Product
```
PATCH /products/admin/:id/approve
```
**Requires:** Admin with 'products' permission

### Reject Product
```
PATCH /products/admin/:id/reject
```
**Requires:** Admin with 'products' permission
**Body:**
```json
{
  "reason": "Product images are not clear. Please upload better quality images."
}
```

---

## Product Categories

| Category |
|----------|
| Engine |
| Transmission |
| Suspension |
| Brakes |
| Electrical |
| Body |
| Interior |
| Exterior |
| Exhaust |
| Cooling |
| Fuel System |
| Steering |
| Wheels & Tires |
| Lighting |
| HVAC |
| Other |

## Product Conditions

| Condition |
|-----------|
| New |
| Refurbished |
| Used - Like New |
| Used - Good |
| Used - Fair |

## Product Status

| Status | Description |
|--------|-------------|
| DRAFT | Not yet submitted |
| PENDING_APPROVAL | Waiting for admin approval |
| ACTIVE | Live and visible |
| REJECTED | Rejected with reason |
| ARCHIVED | Soft deleted |

---

## Health Check

```
GET /health
```
**Response:**
```json
{
  "status": "success",
  "message": "Server is running",
  "timestamp": "2024-01-09T17:00:00.000Z",
  "environment": "development",
  "uptime": 3600.5
}
```

---

## Error Responses

```json
{
  "status": "fail",
  "message": "Error description"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 429 | Too Many Requests |
| 500 | Server Error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| General API | 100 req / 15 min |
| Auth endpoints | 10 req / 15 min |
| Token refresh | 5 req / 1 min |
