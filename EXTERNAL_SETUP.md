# External Services Setup Guide

Status: Draft  
Last updated: 2026-08-20

This guide lists what the project owner needs to create before engineering work can connect the Crate Dig app to real cloud services.

Do not commit secrets to Git. Store secrets in a password manager and later add them to `.env.local`, Vercel environment variables, Google Secret Manager, or Supabase configuration as appropriate.

## 1. Accounts to create or confirm

Create or confirm access to:

- GitHub repo: `john-min/crate-dig`
- Supabase
- Google Cloud
- Cloudflare
- Vercel

Recommended naming:

```txt
Product: Crate Dig
Google Cloud project: crate-dig
Supabase project: crate-dig
Cloudflare R2 bucket: crate-dig-audio-dev
Vercel project: crate-dig
```

Use separate dev/prod resources later. For now, one dev environment is enough.

## 2. Local developer tools

Install locally:

- Node.js
- pnpm
- Python 3.11 or 3.12
- Docker Desktop
- GitHub CLI, optional
- Supabase CLI
- Google Cloud CLI
- Vercel CLI
- Cloudflare Wrangler CLI

Likely commands:

```bash
brew install node pnpm python docker supabase/tap/supabase-cli google-cloud-sdk
npm install -g vercel wrangler
```

Docker must be running for Supabase local development and container builds.

## 3. Supabase setup

Purpose:

- Auth provider for MVP.
- Postgres database.
- pgvector embeddings.
- Access-code table.
- Track/library/analysis/crate data.

### 3.1 Create project

1. Go to Supabase.
2. Create a new project.
3. Name it `crate-dig`.
4. Choose a region close to the expected users and Google Cloud region.
   - Suggested: `us-west` if available, otherwise a nearby US region.
5. Generate and save the database password.
6. Wait for the project to finish provisioning.

### 3.2 Record values

Collect:

```txt
SUPABASE_PROJECT_REF=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=
SUPABASE_DATABASE_URL=
```

Notes:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe to expose to the browser.
- `SUPABASE_SERVICE_ROLE_KEY`, database password, and direct DB URLs are secrets.

### 3.3 Enable pgvector

In Supabase Dashboard:

1. Go to Database.
2. Go to Extensions.
3. Search for `vector`.
4. Enable the `vector` extension.

Equivalent migration later:

```sql
create extension if not exists vector;
```

### 3.4 Configure local migration workflow

Engineering should run this after the repo structure exists:

```bash
supabase init
supabase login
supabase link --project-ref <SUPABASE_PROJECT_REF>
supabase migration new initial_schema
supabase db push --dry-run
supabase db push
```

For local development:

```bash
supabase start
supabase db reset
```

Commit:

```txt
supabase/config.toml
supabase/migrations/*
supabase/seed.sql
```

Do not commit:

```txt
supabase/.temp/
supabase/.branches/
secrets
production data
```

### 3.5 Initial tables to expect

Engineering will create migrations for:

- `profiles`
- `access_codes`
- `libraries`
- `tracks`
- `audio_objects`
- `analysis_runs`
- `track_features`
- `track_embeddings`
- `clusters`
- `crates`
- `crate_tracks`
- `q_conversations`
- `q_actions`

## 4. Google Auth / Google SSO setup

Purpose:

- Google SSO for Supabase Auth.
- Same Google Cloud organization/project can also support Cloud Run.

### 4.1 Create or select Google Cloud project

1. Go to Google Cloud Console.
2. Create/select a project named `crate-dig`.
3. Save:

```txt
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_CLOUD_PROJECT_NUMBER=
```

4. Ensure billing is enabled.

### 4.2 Configure Google Auth Platform / OAuth consent

1. In Google Cloud Console, open Google Auth Platform.
2. Configure app branding:
   - App name: `Crate Dig`
   - User support email: your email
   - Developer contact email: your email
3. Audience:
   - For early development, keep the app in testing/external mode as needed.
   - Add test users if Google requires it.
4. Scopes:
   - Use basic sign-in scopes only:
     - `openid`
     - `email`
     - `profile`

Do not request Google Drive, YouTube, Gmail, or other sensitive scopes for MVP.

### 4.3 Create OAuth client

1. Go to Google Auth Platform > Clients.
2. Create client.
3. Application type: Web application.
4. Name: `Crate Dig Web`.
5. Authorized redirect URI:
   - Get the exact callback URL from Supabase Dashboard > Authentication > Providers > Google.
   - It will look like:

     ```txt
     https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
     ```

6. For local Supabase development, also add:

   ```txt
   http://127.0.0.1:54321/auth/v1/callback
   ```

7. Create the client.
8. Save:

```txt
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
```

### 4.4 Enable Google provider in Supabase

In Supabase Dashboard:

1. Go to Authentication.
2. Providers.
3. Google.
4. Enable Google.
5. Paste:
   - Google OAuth Client ID.
   - Google OAuth Client Secret.
6. Save.

### 4.5 Configure Supabase redirect URLs

In Supabase Dashboard:

1. Go to Authentication > URL Configuration.
2. Set Site URL:

   ```txt
   http://localhost:3000
   ```

   Later replace with production URL.

3. Add redirect URLs:

   ```txt
   http://localhost:3000/**
   https://<your-vercel-preview-pattern>/**
   https://<production-domain>/**
   ```

For Vercel previews, Supabase supports wildcard redirect URLs. Use the account/team slug pattern from the Supabase docs once the Vercel project exists.

## 5. Google Cloud Run / Cloud Run Jobs setup

Purpose:

- Run the Python FastAPI backend.
- Run batch audio analysis jobs.
- Store secrets in Secret Manager.
- Store job container images in Artifact Registry.

### 5.1 Enable billing

1. In Google Cloud Console, select the `crate-dig` project.
2. Confirm billing is enabled.

### 5.2 Install/authenticate gcloud locally

```bash
gcloud auth login
gcloud config set project <GOOGLE_CLOUD_PROJECT_ID>
gcloud config set run/region us-west1
```

Recommended starting region:

```txt
us-west1
```

If Supabase/R2/most users are elsewhere, use a nearby region.

### 5.3 Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com
```

### 5.4 Create Artifact Registry repository

```bash
gcloud artifacts repositories create crate-dig \
  --repository-format=docker \
  --location=us-west1 \
  --description="Crate Dig containers"
```

Record:

```txt
GCP_ARTIFACT_REGISTRY_LOCATION=us-west1
GCP_ARTIFACT_REGISTRY_REPOSITORY=crate-dig
```

### 5.5 Create service account

```bash
gcloud iam service-accounts create crate-dig-analysis \
  --display-name="Crate Dig analysis job"
```

Record:

```txt
GCP_ANALYSIS_SERVICE_ACCOUNT=crate-dig-analysis@<PROJECT_ID>.iam.gserviceaccount.com
```

### 5.6 Add secrets to Secret Manager

Create secrets for:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_AUDIO
R2_ENDPOINT
```

Example:

```bash
printf '%s' '<value>' | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-
```

Grant the analysis service account access to needed secrets:

```bash
gcloud secrets add-iam-policy-binding SUPABASE_SERVICE_ROLE_KEY \
  --member="serviceAccount:crate-dig-analysis@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Repeat for each secret needed by the job.

### 5.7 Cloud Run Job placeholder

Once engineering creates the container image, deploy the job with a command shaped like:

```bash
gcloud run jobs create crate-dig-analysis \
  --image=us-west1-docker.pkg.dev/<PROJECT_ID>/crate-dig/analysis:latest \
  --region=us-west1 \
  --service-account=crate-dig-analysis@<PROJECT_ID>.iam.gserviceaccount.com \
  --memory=4Gi \
  --cpu=2 \
  --task-timeout=3600 \
  --max-retries=1
```

Run it manually:

```bash
gcloud run jobs execute crate-dig-analysis \
  --region=us-west1 \
  --wait
```

Engineering will adjust CPU/memory/timeouts after benchmarking.

## 6. Cloudflare R2 setup

Purpose:

- Store full-track uploaded audio for web demo.
- Store derived previews/waveforms/artifacts.
- Avoid sending audio bytes through Vercel.

### 6.1 Create Cloudflare account / enable R2

1. Create or sign into Cloudflare.
2. Go to R2 object storage.
3. If prompted, enable/purchase R2.

### 6.2 Create buckets

Create dev bucket:

```txt
crate-dig-audio-dev
```

Optional later:

```txt
crate-dig-audio-prod
```

Bucket defaults:

- Private by default.
- Do not enable public bucket access for MVP.

Object key convention:

```txt
libraries/{library_id}/originals/{track_id}/{filename}
libraries/{library_id}/previews/{track_id}.mp3
libraries/{library_id}/waveforms/{track_id}.json
libraries/{library_id}/artifacts/{analysis_run_id}/{track_id}.json
```

### 6.3 Generate R2 API token / S3 credentials

In Cloudflare Dashboard:

1. Go to R2.
2. Under Account Details, select Manage API Tokens.
3. Create an Account API token or User API token.
4. Permission:
   - Object Read & Write.
5. Scope:
   - Specific bucket: `crate-dig-audio-dev`.
6. Create token.
7. Copy values immediately; secret will not be shown again.

Record:

```txt
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_AUDIO=crate-dig-audio-dev
R2_ENDPOINT=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

### 6.4 Optional: install Wrangler

```bash
npm install -g wrangler
wrangler login
wrangler r2 bucket list
```

Engineering may use Wrangler for bucket checks, but the app will likely use S3-compatible SDKs.

## 7. Vercel setup

Purpose:

- Host the Next.js web frontend.
- Manage frontend environment variables.
- Provide preview deployments from GitHub.

### 7.1 Create/import Vercel project

1. Create/sign into Vercel.
2. Import GitHub repo:

   ```txt
   john-min/crate-dig
   ```

3. Project name:

   ```txt
   crate-dig
   ```

4. Framework:

   ```txt
   Next.js
   ```

5. Root directory:

   ```txt
   apps/web
   ```

   This applies after the web app is created.

### 7.2 Configure environment variables

Add to Vercel Project Settings > Environment Variables:

Public/browser-safe:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
```

Server-only:

```txt
SUPABASE_SERVICE_ROLE_KEY=
CLOUD_RUN_ANALYSIS_JOB_NAME=
GCP_PROJECT_ID=
GCP_REGION=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_AUDIO=
R2_ENDPOINT=
```

Rules:

- Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser.
- Do not put secrets in `NEXT_PUBLIC_` variables.
- Scope variables to Development, Preview, and Production as appropriate.

### 7.3 Local Vercel CLI workflow

After the app exists:

```bash
cd apps/web
vercel link
vercel env pull .env.local
pnpm dev
```

Preview deployment:

```bash
vercel deploy
```

Production deployment:

```bash
vercel deploy --prod
```

If GitHub integration is enabled, Vercel should create preview deployments automatically on PRs/branches.

## 8. Values to hand back to engineering

After account setup, provide these values through a secure channel or local `.env.local`, not in chat/Git:

```txt
# Supabase
SUPABASE_PROJECT_REF=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DATABASE_URL=

# Google OAuth
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=

# Google Cloud
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_CLOUD_PROJECT_NUMBER=
GCP_REGION=
GCP_ARTIFACT_REGISTRY_LOCATION=
GCP_ARTIFACT_REGISTRY_REPOSITORY=
GCP_ANALYSIS_SERVICE_ACCOUNT=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_AUDIO=
R2_ENDPOINT=

# Vercel
VERCEL_PROJECT_ID=
VERCEL_ORG_ID=
NEXT_PUBLIC_SITE_URL=
```

## 9. Suggested setup order

Do this in order:

1. GitHub repo confirmed.
2. Supabase project created.
3. Google Cloud project created.
4. Google OAuth client configured and connected to Supabase Auth.
5. Cloudflare R2 bucket + credentials created.
6. Vercel project imported from GitHub.
7. Environment variables added to Vercel.
8. Google Cloud APIs enabled.
9. Artifact Registry repository created.
10. Secret Manager secrets created.
11. Cloud Run Job deployed after engineering creates the container.

## 10. Official docs

- Supabase local development workflow: https://supabase.com/docs/guides/local-development/cli-workflows
- Supabase vector columns / pgvector: https://supabase.com/docs/guides/ai/vector-columns
- Supabase Google login: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Google Sign-In setup: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- Google OAuth clients: https://support.google.com/cloud/answer/15549257
- Cloud Run Jobs: https://docs.cloud.google.com/run/docs/create-jobs
- Cloud Run Job secrets: https://docs.cloud.google.com/run/docs/configuring/jobs/secrets
- Artifact Registry repositories: https://docs.cloud.google.com/artifact-registry/docs/repositories/create-repos
- Cloudflare R2 buckets: https://developers.cloudflare.com/r2/buckets/create-buckets/
- Cloudflare R2 S3 API: https://developers.cloudflare.com/r2/get-started/s3/
- Cloudflare R2 API tokens: https://developers.cloudflare.com/r2/api/tokens/
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Vercel CLI deploy flow: https://vercel.com/docs/projects/deploy-from-cli
