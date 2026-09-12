# Kaamyaabi Project Status

Last updated: 2026-09-12

## Project

Kaamyaabi is a WhatsApp-native job agent for informal and blue-collar workers in Pakistan. The current demo lets a worker send one voice note or text message, builds a worker profile, searches live job sources, prepares/apply-hands-off applications, supports direct-contact opportunity finding, negotiates from employer replies, and keeps watching for new jobs.

Repository:
- GitHub: `git@github.com:azzammasood/kaamyaabi.git`
- Current delivery branch: `main`
- Original branch left intact: `master`

Workspace:
- `C:\Users\ahmad.d\Documents\projects\kaamyaabi`

## Core Tools

- Next.js 16 app router: app, API routes, webhook endpoints.
- TypeScript: main implementation language.
- WhatsApp Cloud API / Meta Developers: inbound and outbound WhatsApp messages.
- ngrok: public HTTPS tunnel for Meta webhook during local demo.
- OpenRouter: primary profile extraction AI now that credits are available.
- Gemini AI Studio: voice transcription and fallback profile extraction.
- Exa API: live multi-source job and company-contact search.
- BoringProject Apply API: optional auto-apply provider hook.
- Resend API: optional real email sending.
- Mock email send: demo fallback when Resend is not configured.
- Mock employer contact discovery: demo fallback when real contact lookup fails.
- Trigger.dev: recommended scheduler for always-watching jobs via HTTP endpoint.
- GitHub SSH: repository push workflow.

## Implemented Features

### WhatsApp Agent

- Handles Meta webhook verification.
- Receives WhatsApp text and audio messages.
- Downloads WhatsApp audio media.
- Transcribes voice notes using Gemini.
- Sends replies through WhatsApp Cloud API.
- Sends each ranked job as a separate WhatsApp interactive button message.
- Supports per-job `Approve` and `Reject` actions from WhatsApp buttons.
- Avoids replying in English before detecting voice-note language.

Paths:
- `src/app/api/whatsapp/webhook/route.ts`
- `src/lib/whatsapp.ts`
- `src/lib/whatsapp-send.ts`

### Multilingual Flow

- Auto-detects first message language from text or voice transcript.
- Supports English, Roman Urdu/Urdu, and Roman Pashto/Pashto.
- Replies in the selected language for profile review, missing details, job lists, applications, watch mode, and negotiation.
- Lets user switch language later with messages like:
  - `zubaan pashto kar do`
  - `urdu mein baat karo`
  - `language english`

Paths:
- `src/lib/language.ts`
- `src/lib/demo-agent.ts`

### Worker Profile Extraction

- Extracts worker profile from informal WhatsApp text or transcript.
- Required fields:
  - name
  - role
  - location
  - experience years
  - minimum salary
  - skills
  - availability
  - languages
- Blocks incomplete profiles instead of filling salary/experience with fake zeros.
- OpenRouter is primary when configured.
- Gemini is fallback.
- Deterministic transcript fallback exists if AI fails.

Paths:
- `src/lib/ai.ts`
- `src/lib/demo-agent.ts`

### Multi-Source Job Hunting

- Searches and ranks live jobs from multiple source types.
- Uses source classification, role filtering, location confidence, salary fit, deduping, and reliability scoring.
- Supports direct-contact preference for phone/email/WhatsApp opportunities.
- Displays each match as its own card-style WhatsApp message with trust notes and approval controls.

Sources covered:
- OLX Pakistan
- Rozee.pk
- Mustakbil
- Jobz.pk
- Indeed
- LinkedIn Jobs
- Greenhouse ATS
- Lever ATS
- Ashby ATS
- Workable ATS
- BambooHR ATS
- Company career pages

Paths:
- `src/lib/jobs.ts`
- `src/lib/job-hunting-agent.ts`
- `src/app/api/demo/jobs/route.ts`

### Trust And Verification Agent

- Scores worker trust from WhatsApp phone, name, role, location, salary expectation, and profile completeness.
- Scores job trust from live/demo source, platform reliability, application route, URL presence, location, salary visibility, and scam-language checks.
- Blocks application attempts for low-trust workers or suspicious jobs.
- Adds visible trust badges to worker profile review and job cards.

Paths:
- `src/lib/trust.ts`
- `src/lib/trust-agent.ts`
- `src/lib/demo-agent.ts`

### Job Application Agent

Application fallback chain:
1. BoringProject auto-apply, if API key and candidate profile id are configured.
2. Direct email from job listing.
3. Direct phone/WhatsApp from job listing.
4. Official ATS/job-board apply link.
5. Exa company contact discovery.
6. Resend real email send, if configured.
7. Mock email send with receipt id, if real email is not configured.
8. Manual application handoff with ready-to-send message.

The bot does not pretend that an application was submitted unless:
- BoringProject queues it,
- Resend sends it,
- mock email mode creates a demo receipt, or
- the user replies `DONE` after submitting manually.

Paths:
- `src/lib/jobs.ts`
- `src/lib/job-application-agent.ts`
- `src/app/api/applications/boringproject/webhook/route.ts`

### Direct Contact And Negotiation

- Commands such as `contacts`, `direct jobs`, and `opportunities` prioritize listings with phone/email/WhatsApp.
- If an employer replies, the user can paste the reply into WhatsApp.
- Bot drafts a salary/availability negotiation response in the selected language.

Paths:
- `src/lib/demo-agent.ts`
- `src/lib/jobs.ts`

### Always-Watching Job Search/Applying

- `WATCH` activates direct-contact-first watching for the current worker profile.
- `WATCH APPLY` activates watch mode and immediately attempts the top job through the application agent.
- In-process watcher can run every few minutes while the dev server is alive.
- Trigger.dev-compatible HTTP endpoint exists for durable scheduled calls.

Trigger/cron endpoint:
- `POST /api/watch/run`
- `GET /api/watch/run`

Paths:
- `src/app/api/watch/run/route.ts`
- `src/lib/demo-agent.ts`
- `src/lib/whatsapp-send.ts`

## Important Commands

WhatsApp demo commands:
- `reset`
- `YES`
- `NO`
- `Approve` button
- `Reject` button
- `JOBS`
- `contacts`
- `direct jobs`
- `opportunities`
- `APPLY 1`
- `APPLY 2`
- `APPLY 3`
- `DONE`
- `WATCH`
- `WATCH APPLY`
- `STATUS`
- `zubaan pashto kar do`
- `language english`

Local commands:
- `npm run dev`
- `npm run lint`
- `npm run build`

## Environment Variables

Template path:
- `.env.example`

Configured locally but not committed:
- `.env.local`

AI:
- `AI_PRIMARY_PROVIDER=openrouter`
- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_MODEL`
- `OPENROUTER_FALLBACK_MODEL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_TRANSCRIBE_MODEL`

Job search:
- `EXA_API_KEY`
- `JOB_SEARCH_SOURCE_LIMIT`

Application:
- `BORING_PROJECT_API_KEY`
- `BORING_PROJECT_CANDIDATE_PROFILE_ID`
- `RESEND_API_KEY`
- `APPLICATION_EMAIL_FROM`
- `MOCK_EMAIL_SEND`
- `MOCK_CONTACT_DISCOVERY`

Watch:
- `WATCH_ENABLED`
- `WATCH_INTERVAL_MS`
- `WATCH_CRON_SECRET`
- `TRIGGER_SECRET_KEY`

WhatsApp/Meta:
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_TEST_NUMBER`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`

App:
- `NEXT_PUBLIC_APP_URL`

## API Routes

- `src/app/api/whatsapp/webhook/route.ts`
  - Meta webhook verification and WhatsApp inbound messages.

- `src/app/api/demo/jobs/route.ts`
  - Demo JSON endpoint for worker profile and job list preview.

- `src/app/api/applications/boringproject/webhook/route.ts`
  - Callback receiver for BoringProject application status.

- `src/app/api/watch/run/route.ts`
  - Trigger.dev-compatible scheduled watch runner.

## Source Modules

- `src/lib/ai.ts`
  - Gemini transcription, OpenRouter/Gemini profile extraction, AI status counters.

- `src/lib/demo-agent.ts`
  - WhatsApp conversation state machine, language handling, job commands, application commands, watch checks, negotiation replies.

- `src/lib/jobs.ts`
  - Live job search, source catalog, ranking, dedupe, application fallback chain, mock email/contact fallback, application status counters.

- `src/lib/language.ts`
  - Language detection and language-switch parsing.

- `src/lib/job-hunting-agent.ts`
  - Separate hunting agent wrapper.

- `src/lib/job-application-agent.ts`
  - Separate application agent wrapper.

- `src/lib/whatsapp.ts`
  - WhatsApp media download helper.

- `src/lib/whatsapp-send.ts`
  - WhatsApp text sending helper.

## Recommended Demo Flow

1. Send voice note in Urdu, Pashto, or English:
   - work wanted
   - experience
   - area
   - minimum salary
   - availability

2. Reply `YES` to confirm profile.

3. Send `contacts` to show direct-contact-first opportunities.

4. Send `APPLY 1`.

5. Show one of the application paths:
   - BoringProject queued, if configured.
   - real listing/contact handoff.
   - mock company contact discovery.
   - mock email receipt.

6. Paste employer reply:
   - `salary 35000 final`

7. Bot drafts negotiation response.

8. Send:
   - `zubaan pashto kar do`

9. Send:
   - `WATCH APPLY`

10. Send:
   - `STATUS`

## Trigger.dev Setup

Use Trigger.dev scheduled tasks or any cron to call:

```text
POST https://YOUR_NGROK_OR_DEPLOYED_URL/api/watch/run
Authorization: Bearer YOUR_WATCH_CRON_SECRET
```

For local demo with no secret in development:

```text
GET http://localhost:3000/api/watch/run
```

## Verification Completed

Latest checks run before this document:
- `npm run lint`
- `npm run build`
- `/api/watch/run` local smoke test returned JSON OK

## Known Demo Boundaries

- True auto-apply across arbitrary job platforms requires official APIs, authenticated browser automation, or a third-party provider such as BoringProject.
- Current implementation avoids false claims and uses mock email/contact fallbacks only when demo flags are enabled.
- In-process watch mode works while the Next dev server is alive.
- Trigger.dev or a deployed cron should be used for durable always-on watching.
