# Mini S3 Bucket - Cloud File Storage System

A scalable, secure, and feature-rich cloud file storage system built with Node.js, Express, MySQL, and Redis. Similar to AWS S3, this project provides file upload, download, sharing, and virus scanning capabilities with enterprise-grade security and performance optimization.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Security Features](#security-features)
- [Performance Optimizations](#performance-optimizations)
- [Learning Journey & Challenges](#learning-journey--challenges)
- [Future Enhancements](#future-enhancements)

---

## 📖 Overview

**Mini S3 Bucket** is a comprehensive cloud storage solution that allows users to:
- Register and authenticate securely
- Upload and download files with digital signatures
- Share files with other users via secure signed URLs
- Scan uploaded files for viruses and malware in real-time
- Manage API keys and permissions
- Track file analysis results

The system is designed with scalability and performance in mind, incorporating advanced concepts like Redis caching, message queuing, rate limiting, and digital signatures for secure file access.

---

## ✨ Key Features

### Authentication & Authorization
- **User Registration & Login**: Secure user management with bcrypt password hashing
- **JWT Tokens**: 48-hour expiration tokens for stateless authentication
- **API Key System**: Generate and manage API keys and secrets for programmatic access

### File Management
- **Secure File Upload**: Files uploaded with Multer with size limits (10MB per request)
- **Signed URL Generation**: Cryptographically signed URLs for secure file access
- **File Sharing**: Share files with other users via secure shareable URLs
- **File Visibility Control**: Files can be marked as private or public
- **File Metadata Storage**: Track file size, MIME type, creation date, and ownership

### Security
- **Rate Limiting**: Protect against DOS attacks using Redis-based rate limiting
- **Digital Signatures**: HMAC-SHA256 cryptographic signatures for URL verification
- **Proxy/CDN Support**: Properly handle requests from CloudFlare, AWS, and other proxies
- **Permission Management**: JSON-based permission system for API keys (upload/download)
- **Virus Scanning**: Integrate with VirusTotal API for real-time malware detection

### Performance Optimization
- **Redis Caching**: Cache API secrets and signatures to reduce database queries by ~7%
- **Queue-Based Processing**: BullMQ for asynchronous virus scanning tasks
- **Pub/Sub Model**: Redis Pub/Sub for real-time communication between API server and queue workers
- **Connection Pooling**: MySQL2 connection pooling for efficient database access
- **Dynamic Load Balancing**: Cluster support for multi-process workload distribution

### Advanced Features
- **Real-time Virus Scanning**: Background queue workers scan files for malicious content
- **Email Notifications**: Send notifications when files are shared using Nodemailer
- **Analysis Tracking**: Store and track virus scan analysis reports
- **Automatic Malware Removal**: Automatically delete dangerous files from the server
- **Comprehensive Logging**: Track all operations and errors

---

## 🏗️ Architecture

### High-Level Flow

```
Client Request
    ↓
Express Server (Trust Proxy)
    ↓
Rate Limiter (Redis)
    ↓
JWT Verification (TokenVerify)
    ↓
Route Handler (File/User Routes)
    ↓
├─ Database (MySQL) - User data, API keys, file metadata
├─ Redis Cache - Signatures, API secrets
└─ Pub/Sub Channel (Redis Publisher)
    ↓
Queue System (BullMQ)
    ↓
Worker (Virus Scan)
    ↓
├─ VirusTotal API - Scan file for malware
├─ File System - Store/Delete files
├─ Database - Record analysis results
└─ Email Service - Send notifications
```

### Multi-Process Clustering
The system supports Node.js clustering for horizontal scaling:
- Primary process initializes database and manages worker processes
- Multiple worker processes handle incoming requests
- Automatic worker restart on failure
- Load balancing across CPU cores

---

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js (v5.1.0)
- **Authentication**: JWT, bcryptjs

### Database & Caching
- **Database**: MySQL 2
- **Cache/Session Store**: Redis (ioredis v5.8.2)
- **Connection Pooling**: mysql2

### File Handling & Processing
- **File Upload**: Multer (v2.0.2)
- **File Streaming**: Node.js fs module
- **Queue Management**: BullMQ (v5.63.1)
- **Malware Scanning**: VirusTotal API
- **Email Service**: Nodemailer (v7.0.11)

### Security & Utilities
- **Password Hashing**: bcryptjs (v3.0.3)
- **Cryptography**: Node.js crypto module (HMAC-SHA256)
- **HTTP Client**: axios (v1.13.2)
- **Environment Variables**: dotenv
- **CORS**: cors middleware

### Development
- **Development Server**: Nodemon (v3.1.10)
- **HTTP Requests**: form-data, axios
- **Monitoring**: prom-client (Prometheus metrics)

---

## 📁 Project Structure

```
Mini S3 Bucket/
├── Database Schema/
│   ├── 01_User.schema.sql          # Users table schema
│   ├── 02_APIKEY.schema.sql        # API keys table schema
│   ├── 03_Files.schema.sql         # Files metadata table schema
│   └── 04_Analysis.schema.sql      # Virus analysis results table schema
│
├── Routes/
│   ├── User.route.js               # User authentication & management endpoints
│   └── File.route.js               # File operations (upload, download, share)
│
├── Services/
│   ├── Queue.Worker.js             # BullMQ workers for async tasks
│   ├── Redis.publisher.js          # Publish messages to Redis channels
│   ├── Redis.subscriber.js         # Subscribe to Redis channels
│   └── VirusTotal.scan.js          # VirusTotal API integration
│
├── Server Security/
│   └── RateLimit.secure.js         # Rate limiting middleware
│
├── SQL Server/
│   └── Database.js                 # MySQL connection pool setup
│
├── Utils Service/
│   ├── API_KEY_SECRET.utils.js     # Generate API keys and secrets
│   ├── DB_Connection.util.js       # Database connection utility
│   ├── ExecuteTable.db.js          # Create tables on startup
│   ├── IDGenerate.utils.js         # Generate unique IDs using crypto
│   ├── Multer.utils.js             # File upload configuration
│   ├── NodeMailer.mail.js          # Email sending setup
│   ├── Redis.utils.js              # Redis client configuration
│   └── TokenVerify.js              # JWT token verification middleware
│
├── uploads/                         # Uploaded files directory
├── server.js                        # Main server entry point
├── package.json                     # Dependencies and scripts
├── .env                             # Environment variables (not in repo)
└── README.md                        # This file
```

---

## 🚀 Installation

### Prerequisites
- Node.js (v14 or higher)
- MySQL 8.0+
- Redis Server
- VirusTotal API Key (for virus scanning)

### Step 1: Clone the Repository
```bash
git clone https://github.com/Arjun9756/Mini-S3-Bucket.git
cd Mini-S3-Bucket
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Set Up Environment Variables
Create a `.env` file in the project root:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=MINI_S3_BUCKET
DB_PORT=3306

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_USERNAME=

# JWT Configuration
JWT_SECRET_KEY=your_secret_key_here
JWT_HASH_ALGORITHM=HS256

# Bcrypt Configuration
BCRYPT_SALT=10

# Crypto Configuration
CRYPTO_SERVER_SECRET=your_crypto_secret_key

# VirusTotal API
VIRUS_TOTAL_API_KEY=your_virustotal_api_key

# Rate Limiting
RATE_LIMIT_THRESHOLD_VAL=100

# Queue Worker
QUEUE_WORKER_CONCURRENCY=1

# Email Configuration (for Nodemailer)
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password

# CORS Origins
CORS_ORIGINS=http://localhost:3000,http://localhost:5000
```

### Step 4: Initialize Database
The database tables are automatically created when the server starts, based on schemas in the `Database Schema` folder. Ensure MySQL is running and the credentials are correct in your `.env` file.

### Step 5: Start the Server
```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on the port specified in `.env` (default: 3000).

---

## ⚙️ Configuration

### MySQL Connection
Edit `Utils Service/DB_Connection.util.js` to customize connection pooling:
```javascript
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionLimit: 10,  // Adjust as needed
  waitForConnections: true,
  queueLimit: 0
});
```

### Redis Connection
Edit `Utils Service/Redis.utils.js` for Redis configuration:
```javascript
const redis = new ioredis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD
});
```

### File Upload Size
Edit `Utils Service/Multer.utils.js` to change the file upload limit:
```javascript
const limits = {
  fileSize: 10 * 1024 * 1024  // 10MB
};
```

---

## 📡 API Endpoints

### User Routes (`/api/user`)

#### Register User
```http
POST /api/user/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```
**Response**: User created with API key and secret

#### Login User
```http
POST /api/user/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```
**Response**: JWT token, user info, and API credentials

---

### File Routes (`/api/file`)

#### Generate Signed URL
```http
POST /api/file/generate-sign-url
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "fileName": "document.pdf",
  "operation": "upload",
  "api_key": "key_xxxxxxxxxxxx"
}
```
**Response**: Cryptographically signed URL valid for 5 minutes

#### Upload File
```http
POST /api/file/upload
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

file: <binary_file_data>
signedURL: <signed_url_from_previous_step>
```
**Response**: File stored with metadata, queued for virus scanning

#### Generate Share URL
```http
POST /api/file/generate-share-url
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "fileID": "file_unique_id",
  "shareWithEmail": "recipient@example.com"
}
```
**Response**: Secure shareable URL and email notification sent

#### Download File
```http
GET /api/file/file-access?uid=USER_ID&path=FILE_PATH&op=download&exp=TIMESTAMP&signature=SIGNATURE
```
**Response**: File download stream

---

## 🗄️ Database Schema

### Users Table
```sql
CREATE TABLE users(
  id varchar(100) PRIMARY KEY,
  email varchar(255) UNIQUE NOT NULL,
  name varchar(100),
  password varchar(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### API Keys Table
```sql
CREATE TABLE api_keys(
  id varchar(100) PRIMARY KEY,
  user_id varchar(100) FOREIGN KEY,
  api_key varchar(255) UNIQUE,
  api_secret_hash varchar(255),
  permission JSON,  -- {"upload": true, "download": true}
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Files Table
```sql
CREATE TABLE files(
  id varchar(100) PRIMARY KEY,
  user_id varchar(100) FOREIGN KEY,
  filename varchar(255),
  storage_path varchar(1024),
  size bigint,
  mime_type varchar(100),
  shared_with JSON,  -- ["user_id_1", "user_id_2"]
  visibilty varchar(10) DEFAULT 'private',
  original_name varchar(512),
  createdAt varchar(212)
);
```

### Analysis Table
```sql
CREATE TABLE analysis(
  id varchar(100) PRIMARY KEY,
  file_id varchar(100) FOREIGN KEY,
  user_id varchar(100) FOREIGN KEY,
  date_scan varchar(255),
  stats JSON,  -- {"malicious": 0, "suspicious": 0, "undetected": 70}
  analysisId varchar(255),
  status varchar(20)  -- 'safe' or 'dangerous',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔐 Security Features

### 1. **Authentication & Authorization**
- JWT tokens with 48-hour expiration
- Password hashing using bcryptjs (salt rounds: 10)
- Token verification middleware on protected routes

### 2. **Digital Signatures**
- HMAC-SHA256 signatures for signed URLs
- Signature verification on file access
- Expiration-based URL validity (300 seconds/5 minutes)

### 3. **Rate Limiting**
- Redis-based per-IP rate limiting
- Configurable threshold (default: 100 requests per 5 minutes)
- Proxy-aware: Trusts CF-Connecting-IP headers for CDN/Proxy environments

### 4. **API Security**
- API keys and secrets for programmatic access
- Unique API secret hash stored in database
- Permission-based access control (upload/download)

### 5. **CORS Policy**
- Whitelist trusted origins
- Credentials allowed for cross-domain requests
- Limited HTTP methods (GET, PUT, POST, PATCH, DELETE)

### 6. **File Security**
- Automatic virus scanning using VirusTotal API
- Real-time malware detection and file removal
- Encrypted file storage paths

### 7. **Proxy/CDN Support**
- Correctly handles requests through CloudFlare, AWS, Google Cloud
- Extracts real client IP from CF-Connecting-IP headers
- Trust proxy configuration: `app.set('trust proxy', true)`

---

## ⚡ Performance Optimizations

### 1. **Redis Caching Strategy**
- Cache API secret signatures to reduce database queries
- Reduce DB calls by ~7%
- Reduce latency by ~2%
- 300-second (5-minute) TTL for cached signatures

### 2. **Database Optimization**
- Connection pooling with mysql2 (max 10 connections)
- Indexed columns on frequently queried fields:
  - `users.email`
  - `files.user_id`
  - `files.id`
- Transactions for multi-step operations
- Proper use of FOREIGN KEY constraints with CASCADE

### 3. **Asynchronous Processing**
- BullMQ for background job queuing
- Non-blocking virus scanning
- Async/await for all I/O operations
- Worker concurrency configuration for optimal throughput

### 4. **Message Queue Architecture**
- Redis Pub/Sub for real-time file scan notifications
- Decouple API server from intensive virus scanning
- Multiple workers can process queue jobs in parallel

### 5. **File Upload Handling**
- Multer for efficient multipart form data parsing
- Memory upload option for smaller files
- Disk upload option for larger files
- Configurable size limits (10MB per request)

---

## 📚 Learning Journey & Challenges

This project served as a comprehensive learning experience for building scalable backend systems. Here are key challenges and solutions:

### Challenge 1: Multi-Process Synchronization
**Issue**: With dynamic load balancing using Node.js clustering, multiple processes running concurrently cause Redis Pub/Sub to generate duplicate data (4x duplication with 4 cluster processes).

**Solution**: Currently using single-process mode; planning to implement process-level deduplication or centralized queue management.

---

### Challenge 2: API Key Generation Strategy
**Issue**: Finding an appropriate library/mechanism for generating unique, secure API keys and secrets.

**Solution**: Implemented using Node.js `crypto.randomBytes()` for generating random bytes and `bcryptjs` for hashing the secret.

---

### Challenge 3: Unique ID Generation
**Issue**: Generating unique IDs for users, files, API keys, and analysis records.

**Solution**: Implemented using `crypto.randomBytes()` for cryptographically secure random ID generation. Could be enhanced with custom algorithms in the future.

---

### Challenge 4: Signed URL Generation & Verification
**Issue**: Determining appropriate parameters for signed URLs and handling type casting issues during verification.

**Solution**: 
- Include: user ID, file path, operation, expiration, and API secret
- Serialize parameters consistently
- Critical: Ensure `exp` is always treated as `Number` during signing and verification (resolved type-casting bug in 35 minutes)

---

### Challenge 5: Signature Caching Strategy
**Issue**: Reducing database queries and latency for URL verification.

**Solution**: 
- Cache signatures in Redis with 5-minute TTL
- Verify signature from cache before querying database
- Reduced DB calls by ~7% and latency by ~2%

---

### Challenge 6: Malware Detection & Real-time Processing
**Issue**: Detecting malicious files without blocking the upload response or storing dangerous files.

**Solution**:
- Redis Pub/Sub for real-time notification from API to worker
- BullMQ queue for background virus scanning
- Automatic file removal upon detection
- Logging analysis results in database

---

### Challenge 7: Rate Limiting Behind Proxy/CDN
**Issue**: Rate limiting by IP address fails when server is behind CloudFlare, AWS, or other proxies (all requests appear from proxy IP).

**Solution**:
- Trust proxy configuration: `app.set('trust proxy', true)`
- Extract real client IP from `CF-Connecting-IP` header
- Falls back to `req.ip` if proxy header not available
- Enables proper per-user rate limiting in production

---

### Challenge 8: Database Performance & Query Optimization
**Issue**: File sharing implemented as JSON array of shared user IDs causes O(N) traversal to check permissions, increasing latency from 20ms to 73ms.

**Solution**: 
- Current implementation works for current scale
- Future optimization: Use sorted sets or separate sharing table for O(log N) binary search
- Consider database schema redesign for large-scale deployments

---

## 🔮 Future Enhancements

1. **Dynamic Load Balancing Fix**
   - Implement process-level deduplication for Pub/Sub messages
   - Support true multi-process clustering without data duplication

2. **Database Schema Optimization**
   - Replace JSON-based file sharing with relational table
   - Implement binary search for permission checks
   - Further optimize query performance

3. **Advanced Malware Detection**
   - Implement on-demand file scanning without server upload
   - Integrate additional security APIs
   - Real-time threat intelligence

4. **Scalability Enhancements**
   - Implement distributed caching strategy
   - Database sharding for large datasets
   - Load balancing across multiple servers

5. **Monitoring & Analytics**
   - Implement Prometheus metrics with prom-client
   - Add comprehensive logging system
   - Create admin dashboard for system monitoring

6. **File Versioning**
   - Support file version history
   - Rollback to previous versions
   - Track file changes over time

7. **Encryption**
   - End-to-end encryption for files
   - Encrypted file storage
   - User-controlled encryption keys

8. **Advanced Sharing Features**
   - Expiration dates for shared links
   - Password-protected file sharing
   - View-only mode with download restrictions

9. **Mobile Application**
   - React Native or Flutter mobile client
   - Offline file sync capabilities

10. **Performance Monitoring**
    - Request tracing
    - Database query profiling
    - Cache hit rate analytics

---

## 📝 License

This project is part of a portfolio and learning journey.

---

## 👨‍💻 Author

**Arjun Singh Negi** - Backend Developer

Repository: [Mini-S3-Bucket](https://github.com/Arjun9756/Mini-S3-Bucket)

---

## 📞 Support

For questions or issues, please open an issue on GitHub.

---

## 🙏 Acknowledgments

- VirusTotal for malware detection API
- BullMQ for robust job queue management
- The Node.js community for excellent tools and libraries

---

**Last Updated**: December 5, 2025
