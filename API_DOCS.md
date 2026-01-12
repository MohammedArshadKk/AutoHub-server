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

## Shopping Cart - Buyer

All cart endpoints require buyer authentication via `accessToken` cookie.

### Add Item to Cart
```
POST /cart
```
**Description:** Add a product to cart or increment quantity if already exists.

**Requires:** Buyer authentication  

**Request Body:**
```json
{
  "productId": "65f8a1b2c3d4e5f6a7b8c9d0",
  "quantity": 2
}
```

**Validations:**
- `productId` must be a valid ObjectId
- `quantity` must be ≥ 1
- Product must exist and be ACTIVE
- Product must not be deleted
- Sufficient stock must be available

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "data": {
    "cart": {
      "_id": "65f8a1234567890abcdef123",
      "buyer": "65f8a0000000000000000001",
      "items": [
        {
          "product": {
            "_id": "65f8a1b2c3d4e5f6a7b8c9d0",
            "name": "Bosch High Output Alternator - 150 Amp",
            "price": 4500,
            "images": ["https://..."],
            "stock": 8,
            "category": "Electrical",
            "condition": "New",
            "inStock": true
          },
          "quantity": 2,
          "priceSnapshot": 4500,
          "addedAt": "2026-01-12T17:30:00.000Z"
        }
      ],
      "subtotal": 9000,
      "totalItems": 2,
      "createdAt": "2026-01-12T17:30:00.000Z",
      "updatedAt": "2026-01-12T17:30:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status | Message | Reason |
|--------|---------|--------|
| 400 | "Product ID is required" | Missing productId |
| 400 | "Quantity must be at least 1" | Invalid quantity |
| 400 | "Product is not available" | Product not ACTIVE or deleted |
| 400 | "Insufficient stock. Only X items available" | Stock not sufficient |
| 400 | "Cannot add X more. Only Y items available" | Adding would exceed stock |
| 401 | "Please login to access this resource" | Not authenticated |
| 403 | "This resource is only accessible to buyers" | Not a buyer role |
| 404 | "Product not found" | Invalid productId |

---

### Get Cart
```
GET /cart
```
**Description:** Retrieve buyer's cart with full product details. Automatically filters out deleted or inactive products.

**Requires:** Buyer authentication

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "data": {
    "cart": {
      "_id": "65f8a1234567890abcdef123",
      "buyer": "65f8a0000000000000000001",
      "items": [
        {
          "product": {
            "_id": "65f8a1b2c3d4e5f6a7b8c9d0",
            "name": "Bosch High Output Alternator - 150 Amp",
            "price": 4500,
            "originalPrice": 5500,
            "images": ["https://auto-hub-storage.s3.ap-south-1.amazonaws.com/..."],
            "stock": 8,
            "category": "Electrical",
            "condition": "New",
            "brand": "Bosch",
            "inStock": true
          },
          "quantity": 2,
          "priceSnapshot": 4500,
          "addedAt": "2026-01-12T17:30:00.000Z"
        },
        {
          "product": {
            "_id": "65f8a2b3c4d5e6f7a8b9c0d1",
            "name": "Premium Brake Pad Set - Front",
            "price": 2800,
            "images": ["https://..."],
            "stock": 15,
            "category": "Brakes",
            "condition": "New",
            "brand": "Brembo",
            "inStock": true
          },
          "quantity": 1,
          "priceSnapshot": 2800,
          "addedAt": "2026-01-12T17:35:00.000Z"
        }
      ],
      "subtotal": 11800,
      "totalItems": 3,
      "createdAt": "2026-01-12T17:30:00.000Z",
      "updatedAt": "2026-01-12T17:35:00.000Z"
    }
  }
}
```

**Empty Cart Response:**
```json
{
  "status": "success",
  "data": {
    "cart": {
      "_id": "65f8a1234567890abcdef123",
      "buyer": "65f8a0000000000000000001",
      "items": [],
      "subtotal": 0,
      "totalItems": 0,
      "createdAt": "2026-01-12T17:30:00.000Z",
      "updatedAt": "2026-01-12T17:30:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| 401 | "Please login to access this resource" |
| 403 | "This resource is only accessible to buyers" |

---

### Update Item Quantity
```
PUT /cart/:productId
```
**Description:** Update quantity of a specific item in cart. Set quantity to 0 to remove the item.

**Requires:** Buyer authentication

**URL Parameters:**
- `productId` - Product ID to update (ObjectId)

**Request Body:**
```json
{
  "quantity": 3
}
```

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "data": {
    "cart": {
      "_id": "65f8a1234567890abcdef123",
      "buyer": "65f8a0000000000000000001",
      "items": [
        {
          "product": {...},
          "quantity": 3,
          "priceSnapshot": 4500,
          "addedAt": "2026-01-12T17:30:00.000Z"
        }
      ],
      "subtotal": 13500,
      "totalItems": 3,
      "createdAt": "2026-01-12T17:30:00.000Z",
      "updatedAt": "2026-01-12T17:40:00.000Z"
    }
  }
}
```

**Validations:**
- `quantity` must be ≥ 0
- If quantity > 0, must not exceed available stock
- Product must exist in cart

**Special Cases:**
- Setting `quantity: 0` removes the item from cart
- Updating to a quantity higher than stock returns error

**Error Responses:**

| Status | Message |
|--------|---------|
| 400 | "Valid quantity is required" |
| 400 | "Insufficient stock. Only X items available" |
| 404 | "Cart not found" |
| 404 | "Product not found" |
| 500 | "Item not found in cart" |

---

### Remove Item from Cart
```
DELETE /cart/:productId
```
**Description:** Remove a specific product from the cart.

**Requires:** Buyer authentication

**URL Parameters:**
- `productId` - Product ID to remove (ObjectId)

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "message": "Item removed from cart",
  "data": {
    "cart": {
      "_id": "65f8a1234567890abcdef123",
      "buyer": "65f8a0000000000000000001",
      "items": [
        // Remaining items
      ],
      "subtotal": 2800,
      "totalItems": 1,
      "createdAt": "2026-01-12T17:30:00.000Z",
      "updatedAt": "2026-01-12T17:45:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| 404 | "Cart not found" |

---

### Clear Cart
```
DELETE /cart
```
**Description:** Remove all items from the cart.

**Requires:** Buyer authentication

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "message": "Cart cleared",
  "data": {
    "cart": {
      "_id": "65f8a1234567890abcdef123",
      "buyer": "65f8a0000000000000000001",
      "items": [],
      "subtotal": 0,
      "totalItems": 0,
      "createdAt": "2026-01-12T17:30:00.000Z",
      "updatedAt": "2026-01-12T17:50:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| 404 | "Cart not found" |

---

## Cart Features

### Price Snapshots
When items are added to cart, the current price is stored as `priceSnapshot`. This ensures:
- Cart subtotal remains consistent even if product prices change
- Buyers see the price they agreed to when adding items
- Checkout process uses reliable pricing

### Auto-Cleanup
When fetching cart via `GET /cart`, the system automatically:
- Filters out products that have been deleted (`isDeleted: true`)
- Filters out products that are no longer ACTIVE
- Removes these items from the cart permanently

### Stock Validation
Every add/update operation validates:
- Product is in stock (`stock > 0`)
- Requested quantity doesn't exceed available stock
- Total cart quantity for a product doesn't exceed stock

### Virtual Fields
Carts include computed fields:
- `subtotal` - Sum of (quantity × priceSnapshot) for all items
- `totalItems` - Total number of items (sum of all quantities)

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
