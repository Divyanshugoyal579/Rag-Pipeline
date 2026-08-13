# Sovereign Enterprise Hybrid RAG Pipeline

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109.0-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.3.0-6DB33F.svg?style=flat&logo=springboot)](https://spring.io/projects/spring-boot)
[![Express](https://img.shields.io/badge/Express-4.18.2-000000.svg?style=flat&logo=express)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?style=flat&logo=react)](https://react.dev/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Production-326CE5.svg?style=flat&logo=kubernetes)](https://kubernetes.io/)

An enterprise-grade, highly scalable, and production-ready **Hybrid Retrieval-Augmented Generation (RAG)** pipeline. This project features a microservice architecture built to support semantic (vector) search, lexical (exact-match BM25) search, intelligent reranking, structured document parsing, metadata orchestration, and a secure real-time streaming chat interface.

---

## 🏗️ System Architecture

```mermaid
graph TD
    Client[React Frontend] <-->|HTTPS / SSE| Gateway[Express API Gateway]
    
    Gateway -->|Auth / Session| Mongo[(MongoDB)]
    Gateway -->|JWT Token Cache| Redis[(Redis Cache)]
    
    Gateway -->|1. Document Upload| Spring[Spring Boot Parser]
    Gateway -->|2. Streaming Chat Query| AI[FastAPI AI Service]
    
    Spring -->|High-Perf Parsing| Spring
    Spring -->|Store Doc Metadata| Mongo
    Spring -->|Notify Ingest| AI
    
    AI -->|Embeddings & Rerank| Models[BGE Embeddings & Reranker]
    AI -->|Semantic Indexing| Postgres[(PostgreSQL + pgvector)]
    AI -->|Lexical Indexing| ES[(Elasticsearch)]
    AI -->|LLM Chat Orchestration| LLM[LLM API / OpenAI]
```

1. **Client (React Frontend)**: A modern interface using React 19, TypeScript, TailwindCSS, Framer Motion (for premium UI/UX micro-animations), and Recharts (for analytics). Supports full Server-Sent Events (SSE) streaming for real-time AI responses with structured citations.
2. **API Gateway (Express & Node.js)**: Features JWT authentication, rate limiting, and request forwarding. Serves as the central security and entry point.
3. **Document Parser & Metadata Orchestrator (Spring Boot)**: A Java microservice focused on high-performance parsing of PDF (Apache PDFBox) and Word/Text documents (Apache POI), managing file uploads and metadata storing in MongoDB & Redis.
4. **AI Service (FastAPI & Python)**: Handles RAG logic using LangGraph/LangChain. Features:
   - Dynamic chunking and BGE Embedding generation (`BAAI/bge-large-en-v1.5`).
   - Vector indexing using PostgreSQL with the `pgvector` extension.
   - Text indexing using Elasticsearch for BM25 keyword matching.
   - Reranking using `bge-reranker-large`.
   - LLM generation proxying with precise chunk-level source citations.

---

## 📂 Repository Structure

```directory
├── api-gateway/          # Express.js security gateway (TypeScript)
│   ├── src/
│   │   ├── config/       # Environment loading
│   │   ├── controllers/  # Auth, Chat, and Document proxies
│   │   ├── middleware/   # Rate limiting, Auth guard, Multi-part Uploads
│   │   ├── models/       # Mongoose Schemas (User, Chat History)
│   │   └── server.ts     # Gateway launcher
│   └── tsconfig.json     # Strict TS compilation config
│
├── spring-service/       # High-performance Document Parser (Java 21 / Maven)
│   ├── src/main/java/    # Spring Boot application, Controller, and Parser
│   ├── src/main/resources/ # application.yml configuration
│   └── pom.xml           # Apache PDFBox, Apache POI, MongoDB & Redis dependencies
│
├── ai-service/           # FastAPI core intelligence (Python 3.10+)
│   ├── app/
│   │   ├── config.py     # Pydantic Settings
│   │   ├── routes/       # Ingestion and query endpoints
│   │   ├── services/     # Chunking, vector DB (pgvector), ES, LangGraph
│   │   └── main.py       # FastAPI runner
│   └── requirements.txt  # LangChain, elasticsearch, psycopg, asyncpg
│
├── frontend/             # React SPA Client (TypeScript / Vite)
│   ├── src/
│   │   ├── services/     # Axios client and SSE fetchers
│   │   ├── App.tsx       # Main client layout, chat window, and admin dashboard
│   │   └── main.tsx      # Render React application root
│   ├── tailwind.config.js# Styling theme configuration
│   └── tsconfig.json     # React TypeScript configurations
│
├── k8s/                  # Kubernetes deployment manifests
│   ├── k8s-manifests.yaml # Combined deployment, services, ingress & ConfigMap
│   └── ci-cd.yaml        # CD deployment pipeline manifest
│
└── docker-compose.yml    # Development infrastructure database stack
```

---

## 🚀 Local Development Setup

### 1. Spin up the Databases
To run the project locally, start the database infrastructure container stack using Docker Compose:
```bash
docker compose up -d
```
This boots up:
* **PostgreSQL + pgvector** (Listening on host port `5433` -> internal container port `5432`)
* **Elasticsearch** (Listening on `http://localhost:9200`)
* **MongoDB** (Listening on `mongodb://localhost:27017`)
* **Redis** (Listening on `redis://localhost:6379`)

---

### 2. Configure Environment Variables
Ensure you have created a `.env` file at the root of the services:
* **API Gateway (`api-gateway/.env`)**:
  ```env
  PORT=5000
  JWT_SECRET=your_jwt_secret_key_12345
  JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_12345
  MONGO_URI=mongodb://admin:admin_password@localhost:27017/rag_auth_db?authSource=admin
  REDIS_URL=redis://localhost:6379
  AI_SERVICE_URL=http://localhost:8000
  SPRING_SERVICE_URL=http://localhost:8081/api/documents
  ```

* **AI Service (`ai-service/.env`)**:
  ```env
  OPENAI_API_KEY=sk-proj-yourOpenAiKeyHere
  POSTGRES_USER=rag_user
  POSTGRES_PASSWORD=rag_password
  POSTGRES_DB=rag_db
  POSTGRES_HOST=localhost
  POSTGRES_PORT=5433
  ELASTICSEARCH_URL=http://localhost:9200
  REDIS_URL=redis://localhost:6379
  ```

---

### 3. Launch Services

#### A. Java Spring Boot Service
Navigate to the `spring-service` directory and run:
```bash
# Compile and package
mvn clean package

# Run the boot service
mvn spring-boot:run
```
*App launches on:* `http://localhost:8081/api/documents`

#### B. API Gateway
Navigate to the `api-gateway` directory, install packages, and build:
```bash
npm install
npm run build
npm start
```
*App launches on:* `http://localhost:5000`

#### C. FastAPI Python Service
Navigate to the `ai-service` directory, set up a virtual environment, install dependencies, and run:
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install requirements
pip install -r requirements.txt

# Run server
python app/main.py
```
*App launches on:* `http://localhost:8000`

#### D. React Frontend
Navigate to the `frontend` directory, install packages, and launch development server:
```bash
npm install
npm run dev
```
*App launches on:* `http://localhost:3000`

---

## ☸️ Production Deployment (Kubernetes)

The Kubernetes configuration is packaged into a complete production manifest located under `k8s/k8s-manifests.yaml`.

Deploy the system stack to your cluster under the namespace `rag-system`:
```bash
kubectl apply -f k8s/k8s-manifests.yaml
```

The manifest spins up:
1. **Namespace**: `rag-system`
2. **ConfigMap**: `rag-config` containing standard cluster internal endpoints (e.g. `postgres-service.rag-system.svc.cluster.local`)
3. **Database Deployments & Services**: PostgreSQL + pgvector, MongoDB, Redis, and Elasticsearch with PersistentVolumeClaims.
4. **Gateway & Microservices Deployments**: Scaled Deployments (`api-gateway`, `spring-service`, `ai-service`) with configured Liveness and Readiness probes.
5. **Ingress Route**: An Nginx Ingress routing HTTP queries matching the hostname `sovereign-rag.enterprise.internal` towards the API gateway.

---

## 🛠️ Diagnostics & Fixed Issues

During the development, the following compilation and network bugs were successfully resolved to ensure system reliability:

* **TypeScript Compilation (Express & React)**: Configured rigid types and restructured code returns across all controllers (`auth`, `chat`, `document`) and middleware (`auth`, `upload`, `errorHandler`) to fully resolve strict rules like `noImplicitReturns`, `noUnusedLocals`, and `noUnusedParameters` under TypeScript strict mode.
* **ConfigMap Database Port Mapping**: Fixed a mismatch where the internal Kubernetes `postgres-service` exposed port `5432` but the global `ConfigMap` set `POSTGRES_PORT` to `5433` (the local developer host port). It is now correctly aligned to connect via cluster port `5432`.
* **Frontend TypeScript compiler**: Resolved a major build showstopper where the `frontend` folder lacked a `tsconfig.json` configuration file, which broke compiler scripts. Added a unified `tsconfig.json` tailored for Vite and React 19.
