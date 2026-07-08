# Self-Taught Computer Science and AI Engineering Portfolio

This repository is my hands-on learning portfolio. I used AI as a tutor, pair programmer, and reviewer while I built practical projects in algorithms, graphics, simulation, cryptography, and applied AI systems.

The goal was not just to complete demos, but to understand the underlying math, engineering tradeoffs, and software design patterns by implementing them myself.

## Portfolio Overview

- Built 40+ standalone demos and mini-applications covering core CS and math topics.
- Implemented interactive visualizations to make complex ideas explainable.
- Progressed from algorithm demos to a production-shaped Retrieval-Augmented Generation (RAG) MVP.
- Practiced testing, modular design, API development, and cloud-ready architecture.

## Featured Projects

## 1) Insurance Claims RAG Assistant MVP

Location: [insurance-rag-mvp](insurance-rag-mvp)

What I built:
- A working RAG pipeline for insurance knowledge questions with citations.
- Local-first development path with cloud-ready AWS structure.
- CLI and API interfaces for indexing PDFs and asking grounded questions.

Core components:
- Ingestion and chunking: [insurance-rag-mvp/ingest/pipeline.py](insurance-rag-mvp/ingest/pipeline.py), [insurance-rag-mvp/ingest/chunker.py](insurance-rag-mvp/ingest/chunker.py)
- Embeddings and indexing: [insurance-rag-mvp/ingest/embedder.py](insurance-rag-mvp/ingest/embedder.py), [insurance-rag-mvp/ingest/indexer.py](insurance-rag-mvp/ingest/indexer.py)
- Retrieval and answering: [insurance-rag-mvp/query/retriever.py](insurance-rag-mvp/query/retriever.py), [insurance-rag-mvp/query/answerer.py](insurance-rag-mvp/query/answerer.py)
- Citations and API: [insurance-rag-mvp/query/citations.py](insurance-rag-mvp/query/citations.py), [insurance-rag-mvp/query/api.py](insurance-rag-mvp/query/api.py)
- AWS serverless hooks: [insurance-rag-mvp/infra/lambda_handler.py](insurance-rag-mvp/infra/lambda_handler.py), [insurance-rag-mvp/infra/s3_event_handler.py](insurance-rag-mvp/infra/s3_event_handler.py)

Concepts I learned:
- Retrieval-Augmented Generation architecture
- Semantic search and cosine similarity
- Chunking strategy and context windows
- Grounded prompting and citation traceability
- API design and serverless ingestion flow

## 2) Binary Search Full-Stack Learning App

Locations:
- Backend: [backend](backend)
- Frontend: [frontend](frontend)

What I built:
- Binary search implementation with input validation and comparator support.
- React interface that visualizes search path decisions.
- Unit tests for successful search, failure cases, sortedness checks, and custom comparator behavior.

Core files:
- Backend algorithm: [backend/src/binarySearch.js](backend/src/binarySearch.js)
- Backend tests: [backend/test/binarySearch.test.js](backend/test/binarySearch.test.js)
- Frontend app: [frontend/src/App.js](frontend/src/App.js)
- Frontend algorithm module: [frontend/src/binarySearch.js](frontend/src/binarySearch.js)

Concepts I learned:
- Time complexity and divide-and-conquer reasoning
- Defensive programming and input validation
- Test-driven reliability for edge cases
- UI-to-algorithm integration

## 3) Algorithm, Cryptography, and Visualization Lab

Location: repository root demos (linked below)

This set of projects focuses on building intuition through interactive visual computing.

Representative demos:
- Search and graph methods: [A_star.html](A_star.html), [Wilson's Algorithm + AVisualization.html](Wilson's%20Algorithm%20+%20AVisualization.html)
- RSA and number theory: [FULL-RSA-DYNAMIC.html](FULL-RSA-DYNAMIC.html), [GNFS_demo.html](GNFS_demo.html), [Pollard_solve_demo.html](Pollard_solve_demo.html), [square_and_multiply2.html](square_and_multiply2.html)
- Fractals and GPU graphics: [mandelbrot_webgl.html](mandelbrot_webgl.html), [Mandelbrot-Set-with-Mouse-Zoom-Pan.html](Mandelbrot-Set-with-Mouse-Zoom-Pan.html), [GPU Shader Fast Math.html](GPU%20Shader%20Fast%20Math.html)
- Physics and systems thinking: [Double-Pendulum-Simulation.html](Double-Pendulum-Simulation.html), [2dEngine.html](2dEngine.html), [2d-physics-engine-guide.html](2d-physics-engine-guide.html)
- Applied logic and game mechanics: [Simple-Sudoku-Game.html](Simple-Sudoku-Game.html), [2048-with-scores.html](2048-with-scores.html), [Simple_Side_Scrolling_Platformer.html](Simple_Side_Scrolling_Platformer.html)

Concepts I learned:
- Cryptographic primitives and attack intuition
- Numerical methods and modular arithmetic
- Graph search and procedural generation
- WebGL shaders and real-time rendering ideas
- Simulation thinking in dynamic systems

## Learning Method: AI-Assisted Self-Teaching

I used AI to accelerate learning while verifying understanding through implementation.

My workflow:
1. Choose a topic (for example, RSA, A*, vector retrieval, or shader math).
2. Ask AI for explanations, pseudocode, and tradeoffs.
3. Build a working implementation from scratch.
4. Add tests or visual output to verify correctness.
5. Refactor structure and documentation for clarity.
6. Repeat with deeper versions (basic demo to advanced or production-shaped variant).

What this demonstrates:
- Strong self-learning ability and technical curiosity
- Ability to turn theory into working software quickly
- Comfort with ambiguity and iterative problem solving
- Responsible use of AI as a productivity tool, not a substitute for understanding

## Technical Skills Demonstrated

Languages and runtime:
- JavaScript
- Python
- HTML/CSS

Frameworks and tooling:
- React
- FastAPI
- PyTest
- Jest

AI and data systems:
- OpenAI embeddings and answer generation
- Vector retrieval and ranking
- JSONL local vector store patterns
- OpenSearch-ready indexing model

Cloud and architecture:
- AWS Lambda event-driven ingestion pattern
- S3 event workflow design
- Config-first modular project structure

Core CS and math topics:
- Searching and sorting algorithms
- Graph/pathfinding algorithms
- Number theory and cryptography
- Fractals, simulation, and graphics pipelines

## Resume-Ready Bullet Points

You can adapt these directly for your resume:

- Built 40+ interactive CS and math demos (algorithms, cryptography, graphics, and simulations) to self-teach advanced concepts through implementation.
- Developed an insurance-domain RAG MVP with PDF ingestion, chunking, embeddings, vector retrieval, grounded answer generation, and citation output.
- Designed both CLI and API interfaces for the RAG assistant and structured the system for AWS Lambda plus OpenSearch deployment.
- Implemented and tested reusable search modules in JavaScript with edge-case handling, comparator support, and UI visualization of algorithm execution paths.
- Applied AI-assisted development workflow to rapidly learn unfamiliar domains and deliver functioning, documented software artifacts.

## How to Explore This Repository

- Main demo index page: [index.html](index.html)
- RAG project quick start: [insurance-rag-mvp/README.md](insurance-rag-mvp/README.md)
- RAG architecture deep dive: [insurance-rag-mvp/REAL_WORLD_IMPLEMENTATION_GUIDE.md](insurance-rag-mvp/REAL_WORLD_IMPLEMENTATION_GUIDE.md)
- Frontend binary search app notes: [frontend/public/README.md](frontend/public/README.md)

## Next Growth Targets

- Add benchmark and quality metrics for retrieval performance.
- Add CI checks for tests and formatting across projects.
- Deploy selected demos and the RAG API publicly with usage documentation.
- Consolidate project metadata into a portfolio site with screenshots and short case studies.
