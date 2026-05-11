# ORCA-CRM Deployment Notes

## Google Cloud service account (ADC) setup

This repository supports authenticating Google Cloud SDK tools and Google client libraries via Application Default Credentials (ADC) using the `GOOGLE_APPLICATION_CREDENTIALS` environment variable.

### 1) Validate the key file

The key file must be a JSON service-account key that contains the standard fields:
`type`, `project_id`, `private_key_id`, `private_key`, `client_email`, `client_id`, `auth_uri`, `token_uri`, `auth_provider_x509_cert_url`, `client_x509_cert_url`.

### 2) Configure `GOOGLE_APPLICATION_CREDENTIALS`

Set it to the absolute path of your JSON key file:

```powershell
setx GOOGLE_APPLICATION_CREDENTIALS "C:\path\to\service-account.json"
```

Restart your terminal after `setx` so the variable is visible to new shells.

### 3) Authenticate with gcloud

```powershell
gcloud auth activate-service-account --key-file="$env:GOOGLE_APPLICATION_CREDENTIALS"
gcloud auth list
```

### 4) Smoke test (proves the key works)

This repo includes a minimal integration test that:
- validates the JSON structure,
- activates the service account,
- requests an OAuth access token,
- calls the Google Cloud Storage JSON API and asserts a 200 response.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\gcp-smoke-test.ps1
```

### 5) IAM roles (least privilege)

Grant only what the application needs. Example role bindings (project-level):

```powershell
$PROJECT="YOUR_PROJECT_ID"
$SA="serviceAccount:YOUR_SERVICE_ACCOUNT_EMAIL"

gcloud projects add-iam-policy-binding $PROJECT --member $SA --role roles/storage.objectAdmin
gcloud projects add-iam-policy-binding $PROJECT --member $SA --role roles/viewer
```

Adjust roles per resource scope (project/folder/bucket) to minimize access.

## Key safety (do not commit)

- The service account key file must never be committed.
- This repo ignores the key file name and `.env.gcp` via [.gitignore](.gitignore).
- In production, store keys in a secrets manager or use Workload Identity instead of keys.

## Rotation & revocation (≤ 90 days)

Recommended rotation schedule: every 90 days (or sooner if exposed).

Rotation procedure (no downtime):
1. Create a new service account key in Google Cloud Console.
2. Update the secret/environment variable to point to the new key.
3. Run the smoke test to confirm access.
4. Revoke/delete the old key after verification.

If compromise is suspected:
1. Immediately delete the exposed key in Google Cloud Console.
2. Create a new key and repeat the rotation procedure.

## Google Cloud API key (web key) hardening

Firebase Web API keys are not secrets, but they must still be restricted to prevent abuse and quota drain.

### Recommended restrictions

1) Application restriction: HTTP referrers
- Add your allowed origins:
  - `http://localhost:5173/*` (Vite dev, if used)
  - `http://localhost:4173/*` (ICS preview)
  - `http://localhost:4174/*` (KDS preview)
  - your production domains (e.g., `https://ics.yourdomain.com/*`, `https://kds.yourdomain.com/*`)

2) API restriction: only the minimum required APIs
- Enable and restrict to the Firebase-related APIs you use (common):
  - Identity Toolkit API
  - Firebase Installations API
  - Cloud Firestore API
  - Cloud Storage for Firebase / Cloud Storage JSON API

3) Monitoring
- Set budget/alerting for unexpected usage spikes.
- Review API key usage metrics under APIs & Services → Metrics.

## Containerized deployment (Cloud Run) for ICS + KDS

These apps are static SPAs (Vite builds to `dist`). If you must deploy them to Cloud Run:
- build a container image that serves the built assets via nginx,
- deploy two services: one for ICS and one for KDS.

### Local container build

```powershell
docker build --build-arg APP=ics -t orca-ics:local .
docker run --rm -p 8081:8080 orca-ics:local

docker build --build-arg APP=kds -t orca-kds:local .
docker run --rm -p 8082:8080 orca-kds:local
```

### Cloud Build + Cloud Run (production pipeline)

This repo includes:
- [Dockerfile](Dockerfile) (multi-stage build, `APP=ics|kds`)
- [cloudbuild.yaml](cloudbuild.yaml) (builds + pushes + deploys both services)

Trigger:

```powershell
gcloud builds submit --config cloudbuild.yaml --substitutions=_REGION=us-central1,_AR_REPO=orca-crm,_SERVICE_ICS=orca-ics,_SERVICE_KDS=orca-kds
```

### Rollback

```powershell
gcloud run revisions list --service orca-ics --region us-central1
gcloud run services update-traffic orca-ics --region us-central1 --to-revisions REVISION_NAME=100
```
