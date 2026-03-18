# Smart Transcription – Google Cloud Run

A React + TypeScript SPA that performs AI-powered meeting transcription, served via nginx.

---

## Deploying to Google Cloud Run via Cloud Build

### Prerequisites

- A Google Cloud project with **Cloud Run**, **Cloud Build**, and **Artifact Registry** APIs enabled.
- The source repository connected to Cloud Build (GitHub integration).

### Cloud Build continuous-deployment settings

When setting up a Cloud Run service with continuous deployment, use the following values:

| Field | Value |
|---|---|
| **Branch** | `^main$` *(see note below)* |
| **Build type** | Cloud Build configuration file (yaml or json) |
| **Source location** | `/cloudbuild.yaml` |

#### Which branch regex should I use?

The Branch field accepts a regular expression matched against the full branch name.

| You want to… | Enter |
|---|---|
| Deploy only when `main` is pushed (**recommended for production**) | `^main$` |
| Deploy from every branch (useful for previews / staging) | `.*` |
| Deploy from one specific feature branch, e.g. `copilot/refractor-app` | `^copilot/refractor-app$` |
| Deploy from any `copilot/` branch | `^copilot/` |

**For a production Cloud Run service, enter `^main$`.**  
This means Cloud Build will trigger a new deployment only when commits are pushed to (or merged into) the `main` branch.

> **Source location** is the other editable field you need to fill in. Enter `/cloudbuild.yaml` — this is the path (relative to the repository root) to the Cloud Build configuration file.

### How it works

1. Cloud Build checks out your `main` branch.
2. It reads `/cloudbuild.yaml`, which performs a three-step build:
   - **Step 1 (build):** builds the Docker image with public config variables and secret API keys injected as `--build-arg` values (secrets fetched from Secret Manager) so Vite can bake them into the React SPA.
   - **Step 2 (push):** pushes the image to Artifact Registry.
   - **Step 3 (deploy):** deploys the new image to the `smart-transcription` Cloud Run service.
3. At container start-up, `envsubst` replaces `${PORT}` in the nginx config with the value of the `$PORT` environment variable injected by Cloud Run (default: `8080`).

### Local development

```bash
npm install
npm run dev       # Vite dev server on http://localhost:5173
```

### Local Docker build (optional smoke-test)

```bash
docker build -t smart-transcription .
docker run -p 8080:8080 -e PORT=8080 smart-transcription
# Open http://localhost:8080
```
