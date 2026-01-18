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

### Bulk Create Products (JSON Array)
```
POST /products/bulk
```
**Description:** Create multiple products at once from a JSON array. Frontend parses Excel and sends JSON.

**Requires:** Admin authentication  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "products": [
    {
      "name": "Bosch High Output Alternator - 150 Amp",
      "description": "High-performance alternator with 150 amp output...",
      "category": "Electrical",
      "price": 4500,
      "stock": 10,
      "condition": "New",
      "status": "PENDING_APPROVAL",
      "brand": "Bosch",
      "partNumber": "ALT-150-BOSCH",
      "warranty": "2 years",
      "compatibleVehicles": [
        {
          "year": 2018,
          "make": "Toyota",
          "model": "Camry",
          "variant": "LE 2.5L"
        }
      ],
      "specifications": {
        "Output": "150 Amps",
        "Material": "Aluminum"
      }
    },
    {
      "name": "Front Disc Brake Pads",
      "description": "Premium ceramic brake pads...",
      "category": "Brakes",
      "price": 2500,
      "stock": 25
    }
  ]
}
```

**Validation Rules:**
- **Required:** name, description, category
- **Optional:** All other product fields
- **Max Products:** 100 per request
- **Categories:** Must be valid from enum
- **Vehicles:** Max 5 per product

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Bulk upload completed",
  "data": {
    "total": 2,
    "successCount": 2,
    "failureCount": 0,
    "results": [
      {
        "index": 0,
        "success": true,
        "productId": "65f8a1b2c3d4e5f6a7b8c9d0",
        "name": "Bosch High Output Alternator - 150 Amp"
      },
      {
        "index": 1,
        "success": true,
        "productId": "65f8a2b3c4d5e6f7a8b9c0d1",
        "name": "Front Disc Brake Pads"
      }
    ]
  }
}
```

**Partial Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Bulk upload completed with some failures",
  "data": {
    "total": 3,
    "successCount": 2,
    "failureCount": 1,
    "results": [
      {
        "index": 0,
        "success": true,
        "productId": "65f8a1b2c3d4e5f6a7b8c9d0"
      },
      {
        "index": 1,
        "success": false,
        "error": "Duplicate product name",
        "name": "Existing Product"
      },
      {
        "index": 2,
        "success": true,
        "productId": "65f8a3b4c5d6e7f8a9b0c1d2"
      }
    ]
  }
}
```

**Validation Error Response:** `400 Bad Request`
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "index": 0,
      "field": "category",
      "message": "\"category\" must be one of [Engine, Transmission, ...]"
    },
    {
      "index": 1,
      "field": "price",
      "message": "\"price\" must be a number"
    }
  ]
}
```

**Frontend Workflow:**
1. User uploads Excel file in browser
2. Frontend parses Excel using `xlsx` library
3. Transform Excel rows to product objects
4. Send JSON array to this endpoint
5. Display results to user

**Error Responses:**

| Status | Message | Reason |
|--------|---------|--------|
| 400 | "Validation failed" | Invalid product data |
| 401 | "Please login to access this resource" | Not authenticated |
| 403 | "This resource is only accessible to admins" | Not admin role |


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

## Orders & Payments - Buyer

All order endpoints require buyer authentication via `accessToken` cookie.

### Create COD Order
```
POST /orders
```
**Description:** Create a cash-on-delivery order directly. Products are validated and prices are fetched from database.

**Requires:** Buyer authentication

**Request Body:**
```json
{
  "items": [
    {
      "_id": "65f8a1b2c3d4e5f6a7b8c9d0",
      "name": "Brake Pad Set",
      "price": 1500,
      "quantity": 2,
      "images": []
    }
  ],
  "shippingAddress": {
    "fullName": "John Doe",
    "phone": "+91 9876543210",
    "addressLine1": "123 Main Street",
    "addressLine2": "",
    "city": "Mumbai",
    "state": "Maharashtra",
    "zipCode": "400001",
    "country": "India"
  },
  "pricing": {
    "subtotal": 3000,
    "shippingCharge": 50,
    "handlingCharge": 20,
    "tax": 0,
    "totalAmount": 3070
  }
}
```

**Automatic Calculations:**
- Shipping: Free for orders ≥ ₹1000, else ₹50
- Handling: ₹20 per order
- Prices validated against database

**Success Response:** `201 Created`
```json
{
  "status": "success",
  "message": "Order placed successfully",
  "data": {
    "order": {
      "_id": "65f8c1234567890abcdef456",
      "orderNumber": "ORD000001",
      "totalAmount": 3070,
      "orderStatus": "pending",
      "paymentStatus": "pending",
      "orderedAt": "2026-01-18T10:45:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| 400 | "Order must contain at least one item" |
| 400 | "Shipping address is required" |
| 404 | "Product not found" |
| 400 | "Product is not available for purchase" |
| 400 | "Insufficient stock" |

---

### Create Order for Online Payment
```
POST /orders/create-for-payment
```
**Description:** Create order with status `payment_pending` before initiating Razorpay payment.

**Requires:** Buyer authentication

**Request Body:** Same as COD order

**Success Response:** `201 Created`
```json
{
  "status": "success",
  "message": "Order created, awaiting payment",
  "data": {
    "order": {
      "_id": "65f8c2345678901bcdef567",
      "orderNumber": "ORD000002",
      "totalAmount": 3070,
      "orderStatus": "payment_pending",
      "paymentStatus": "pending_payment"
    }
  }
}
```

---

### Initiate Payment
```
POST /orders/:orderId/payment/initiate
```
**Description:** Create Razorpay order and return credentials for frontend payment modal.

**Requires:** Buyer authentication

**URL Parameters:**
- `orderId` - Order ID (must be in `payment_pending` status)

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "message": "Payment initiated",
  "data": {
    "razorpayOrderId": "order_MaB1xVZ8j9KpLk",
    "amount": 307000,
    "currency": "INR",
    "keyId": "rzp_test_xxxxxxxxxxxxx"
  }
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| 404 | "Order not found" |
| 400 | "Order is not awaiting payment" |
| 500 | "Payment gateway not configured" |

---

### Verify Payment
```
POST /orders/:orderId/payment/verify
```
**Description:** Verify Razorpay payment signature and update order status to `confirmed`.

**Requires:** Buyer authentication

**URL Parameters:**
- `orderId` - Order ID

**Request Body:**
```json
{
  "razorpayOrderId": "order_MaB1xVZ8j9KpLk",
  "razorpayPaymentId": "pay_NaC2yWA9k0QqMn",
  "razorpaySignature": "abc123def456..."
}
```

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "message": "Payment verified successfully. Order confirmed!",
  "data": {
    "order": {
      "_id": "65f8c2345678901bcdef567",
      "orderNumber": "ORD000002",
      "orderStatus": "confirmed",
      "paymentStatus": "paid",
      "razorpayPaymentId": "pay_NaC2yWA9k0QqMn"
    }
  }
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| 400 | "Missing payment verification details" |
| 400 | "Payment verification failed. Invalid signature." |
| 400 | "Payment not captured. Please try again." |
| 404 | "Order not found" |

**Note:** Failed verification updates order status to `payment_failed`.

---

### Get My Orders
```
GET /orders/my-orders
```
**Description:** Retrieve all orders for the logged-in buyer with pagination.

**Requires:** Buyer authentication

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| status | string | Filter by order status |
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 10) |

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "data": {
    "orders": [
      {
        "_id": "65f8c1234567890abcdef456",
        "orderNumber": "ORD000001",
        "items": [
          {
            "product": {
              "_id": "65f8a1b2c3d4e5f6a7b8c9d0",
              "name": "Brake Pad Set",
              "images": ["https://..."],
              "price": 1500
            },
            "quantity": 2,
            "price": 1500
          }
        ],
        "totalAmount": 3070,
        "orderStatus": "delivered",
        "paymentStatus": "paid",
        "paymentMethod": "online",
        "orderedAt": "2026-01-15T10:00:00.000Z",
        "deliveredAt": "2026-01-17T14:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3
    }
  }
}
```

---

### Get Order by ID
```
GET /orders/:orderId
```
**Description:** Get detailed information about a specific order.

**Requires:** Buyer authentication (must be order owner)

**URL Parameters:**
- `orderId` - Order ID

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "data": {
    "order": {
      "_id": "65f8c1234567890abcdef456",
      "orderNumber": "ORD000001",
      "buyer": "65f8a0000000000000000001",
      "items": [...],
      "shippingAddress": {
        "fullName": "John Doe",
        "phone": "+91 9876543210",
        "addressLine1": "123 Main Street",
        "city": "Mumbai",
        "state": "Maharashtra",
        "zipCode": "400001",
        "country": "India"
      },
      "subtotal": 3000,
      "shippingCharge": 50,
      "handlingCharge": 20,
      "tax": 0,
      "totalAmount": 3070,
      "paymentMethod": "cod",
      "paymentStatus": "pending",
      "orderStatus": "processing",
      "orderedAt": "2026-01-18T10:45:00.000Z",
      "trackingNumber": null,
      "createdAt": "2026-01-18T10:45:00.000Z",
      "updatedAt": "2026-01-18T11:00:00.000Z"
    }
  }
}
```

**Error Response:**

| Status | Message |
|--------|---------|
| 404 | "Order not found" |

---

### Cancel Order
```
POST /orders/:orderId/cancel
```
**Description:** Cancel an order. Automatically processes refund for paid orders.

**Requires:** Buyer authentication

**URL Parameters:**
- `orderId` - Order ID

**Request Body:**
```json
{
  "reason": "Changed my mind"
}
```

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "message": "Order cancelled successfully",
  "data": {
    "order": {
      "_id": "65f8c1234567890abcdef456",
      "orderNumber": "ORD000001",
      "orderStatus": "cancelled",
      "cancelledAt": "2026-01-18T11:30:00.000Z",
      "cancellationReason": "Changed my mind"
    }
  }
}
```

**Cancellable Statuses:**
- `pending` (COD)
- `payment_pending` (Awaiting payment)
- `confirmed` (Just confirmed)

**Error Responses:**

| Status | Message |
|--------|---------|
| 400 | "Order cannot be cancelled. Current status: shipped" |
| 404 | "Order not found" |

**Note:** Refund is automatically initiated for paid orders. Refund status may be updated via webhooks.

---

## Order Status Flow

### COD Flow
```
pending → confirmed → processing → shipped → delivered
   ↓
cancelled
```

### Online Payment Flow
```
payment_pending → confirmed → processing → shipped → delivered
   ↓                 ↓
payment_failed   cancelled
```

### Order Statuses

| Status | Description |
|--------|-------------|
| `payment_pending` | Waiting for online payment |
| `pending` | COD order awaiting confirmation |
| `confirmed` | Order confirmed (payment verified) |
| `processing` | Being prepared for shipment |
| `shipped` | On the way to customer |
| `delivered` | Successfully delivered |
| `cancelled` | Cancelled by user or admin |
| `payment_failed` | Payment verification failed |

### Payment Statuses

| Status | Description |
|--------|-------------|
| `pending_payment` | Awaiting payment |
| `pending` | COD - payment on delivery |
| `paid` | Payment successful |
| `failed` | Payment failed |

---

## Address Management - Buyer

All address endpoints require buyer authentication via `accessToken` cookie.

### Get All Addresses
```
GET /addresses
```
**Description:** Retrieve all addresses for logged-in buyer. Returns addresses sorted by default first, then by creation date.

**Requires:** Buyer authentication

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "results": 2,
  "data": {
    "addresses": [
      {
        "_id": "65f8a1234567890abcdef123",
        "user": "65f8a0000000000000000001",
        "title": "Home",
        "fullName": "John Doe",
        "phone": "9876543210",
        "addressLine1": "123 MG Road",
        "addressLine2": "Near Metro Station",
        "city": "Bangalore",
        "state": "Karnataka",
        "zipCode": "560001",
        "country": "India",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "location": {
          "type": "Point",
          "coordinates": [77.5946, 12.9716]
        },
        "isDefault": true,
        "createdAt": "2026-01-15T12:00:00.000Z",
        "updatedAt": "2026-01-15T12:00:00.000Z"
      },
      {
        "_id": "65f8b2345678901bcdef234",
        "title": "Office",
        "fullName": "John Doe",
        "addressLine1": "456 Tech Park",
        "city": "Bangalore",
        "state": "Karnataka",
        "zipCode": "560100",
        "isDefault": false,
        ...
      }
    ]
  }
}
```

---

### Get Single Address
```
GET /addresses/:id
```
**Description:** Get details of a specific address. User must own the address.

**Requires:** Buyer authentication

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "data": {
    "address": {
      "_id": "65f8a1234567890abcdef123",
      "title": "Home",
      "fullName": "John Doe",
      ...
    }
  }
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| 404 | "Address not found" |
| 403 | "Not authorized to access this address" |

---

### Create Address
```
POST /addresses
```
**Description:** Create a new address. If this is the first address, it will automatically be set as default.

**Requires:** Buyer authentication

**Request Body:**
```json
{
  "title": "Home",
  "fullName": "John Doe",
  "phone": "9876543210",
  "addressLine1": "123 MG Road",
  "addressLine2": "Near Metro Station",
  "city": "Bangalore",
  "state": "Karnataka",
  "zipCode": "560001",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "googleMapsLink": "https://goo.gl/maps/..."
}
```

**Required Fields:**
- `title` (max 50 chars)
- `fullName` (max 100 chars)
- `phone` (10 digits starting with 6-9, with or without +91 prefix)
- `addressLine1` (max 200 chars)
- `city`
- `state`
- `zipCode` (6 digits)

**Optional Fields:**
- `addressLine2`, `latitude`, `longitude`, `googleMapsLink`, `isDefault`

**Success Response:** `201 Created`
```json
{
  "status": "success",
  "data": {
    "address": {
      "_id": "65f8a1234567890abcdef123",
      "isDefault": true,
      ...
    }
  }
}
```

**Validation Errors:** `400 Bad Request`
```json
{
  "status": "fail",
  "message": "Please provide a valid 10-digit phone number starting with 6-9"
}
```

---

### Update Address
```
PUT /addresses/:id
```
**Description:** Update an existing address. User must own the address.

**Requires:** Buyer authentication

**Request Body:** Same as Create Address (all fields optional)

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "data": {
    "address": {
      "_id": "65f8a1234567890abcdef123",
      ...
    }
  }
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| 404 | "Address not found" |
| 403 | "Not authorized to update this address" |
| 400 | Validation errors |

---

### Delete Address
```
DELETE /addresses/:id
```
**Description:** Delete an address. If the deleted address was default, another address will automatically be set as default.

**Requires:** Buyer authentication

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "message": "Address deleted successfully",
  "data": null
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| 404 | "Address not found" |
| 403 | "Not authorized to delete this address" |

---

### Set as Default Address
```
PATCH /addresses/:id/default
```
**Description:** Set a specific address as the default. All other addresses will be unmarked as default.

**Requires:** Buyer authentication

**Success Response:** `200 OK`
```json
{
  "status": "success",
  "data": {
    "address": {
      "_id": "65f8a1234567890abcdef123",
      "isDefault": true,
      ...
    }
  }
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| 404 | "Address not found" |
| 403 | "Not authorized to update this address" |

---

## Address Features

### Automatic Default Management
- First address is automatically set as default
- Only one address can be default at a time
- Deleting default address auto-assigns new default

### Geolocation Support
- Stores coordinates in GeoJSON format `[longitude, latitude]`
- 2dsphere index for location-based queries
- Optional latitude/longitude fields

### Validation
- Indian phone format: 10 digits starting with 6-9 (accepts `+91` prefix with optional space)
  - Valid: `9876543210`, `+919876543210`, `+91 9876543210`
  - All formats normalized to `9876543210` in database
- Indian PIN code: 6 digits
- Coordinates validated for valid ranges

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
