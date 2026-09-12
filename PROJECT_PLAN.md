# Kaamyaabi Project Plan

## One-Line Pitch

Kaamyaabi is a WhatsApp-native job agent for Pakistan that represents workers: it turns a voice note into a verified profile, finds jobs, applies with consent, negotiates pay/timing, and keeps watching for better opportunities.

## Demo Goal

Build a 3-hour hackathon demo where the entire worker journey happens inside WhatsApp using Meta WhatsApp Cloud API.

The demo must prove:

- Voice note to structured worker profile
- Profile to instant CV
- Job matching from seeded jobs
- Agent asks permission before acting
- Agent contacts/negotiates with employer
- Worker receives improved offer
- Background watcher sends proactive job alert
- Auth0 adds trust/verification layer

## Core Positioning

Most recruiting AI helps employers screen candidates.

Kaamyaabi flips the model:

**It represents the worker.**

This is not a job board, not just alerts, and not just chatbot Q&A. It is a personal job representative inside WhatsApp.

## Target Demo Persona

Name: Ahmed Khan  
Role: Driver  
Location: G-9/G-10 Islamabad  
Experience: 4 years  
Minimum salary: PKR 40,000  
Availability: Monday  
Languages: Urdu, Punjabi  

Demo voice note:

```text
Assalamualaikum, mujhe driver ka kaam chahiye G-9 ya G-10 ke qareeb.
Mere paas 4 saal ka experience hai. Manual aur automatic dono gaari chala leta hoon.
Salary 40 hazaar se kam na ho. Main Monday se start kar sakta hoon.
```

## Best Tool Stack

| Need | Tool |
|---|---|
| WhatsApp channel | Meta WhatsApp Cloud API |
| Backend | Next.js API routes |
| Hosting/webhook | Vercel or ngrok |
| AI reasoning | OpenAI Responses API |
| Voice transcription | OpenAI audio transcription |
| Voice reply | OpenAI TTS |
| Database | Supabase |
| Identity/trust | Auth0 |
| Background jobs | Trigger.dev |
| Employer demo | Simulated employer thread or second WhatsApp test number |

## Architecture

```text
Worker on WhatsApp
  -> Meta WhatsApp Cloud API
  -> Next.js webhook
  -> OpenAI agent logic
  -> Supabase state/jobs/profile
  -> Auth0 verification link when needed
  -> Trigger.dev background watcher
  -> Meta WhatsApp Cloud API reply
  -> Worker on WhatsApp
```

## Repository Scope

Build one focused Next.js project:

```text
kaamyaabi/
  src/app
    api/whatsapp/webhook
    api/demo/state
    api/demo/reset
    api/trigger/watch
    verify
    page.tsx
  src/lib
    agent.ts
    whatsapp.ts
    jobs.ts
    profile.ts
    store.ts
    prompts.ts
```

## Demo Flow

### 1. Worker Starts Chat

Worker sends:

```text
Hi
```

Kaamyaabi replies:

```text
Assalamualaikum. I am Kaamyaabi, your job agent.
Send me one voice note with the work you want, your experience, area, and minimum salary.
```

Tools:

- Meta WhatsApp Cloud API
- Next.js webhook

### 2. Worker Sends Voice Note

Worker sends the prepared Urdu/English voice note.

Backend receives the WhatsApp audio media ID, downloads it from Meta, and sends it to OpenAI for transcription.

Tools:

- Meta media API
- OpenAI audio transcription

### 3. Agent Builds Worker Profile

OpenAI extracts structured data:

```json
{
  "name": "Ahmed Khan",
  "role": "Driver",
  "location": "G-9/G-10 Islamabad",
  "experience_years": 4,
  "skills": ["Manual driving", "Automatic driving", "City routes"],
  "minimum_salary_pkr": 40000,
  "availability": "Monday",
  "languages": ["Urdu", "Punjabi"]
}
```

Kaamyaabi replies:

```text
I made your worker profile:

Role: Driver
Location: G-9/G-10 Islamabad
Experience: 4 years
Minimum salary: PKR 40,000
Skills: Manual driving, automatic driving

Is this correct? Reply YES or EDIT.
```

Tools:

- OpenAI Responses API
- Supabase

### 4. Agent Generates CV

Kaamyaabi generates a simple one-page worker CV.

For hackathon speed, generate an HTML CV first. PDF export is optional.

CV fields:

- Name
- Role
- Location
- Experience
- Skills
- Availability
- Verification badge

Tools:

- Next.js HTML template
- OpenAI for CV wording

### 5. Worker Verifies Identity

Kaamyaabi sends:

```text
Before I contact employers, please verify your identity:
https://kaamyaabi.vercel.app/verify
```

Worker opens the link, logs in with Auth0, and returns to WhatsApp.

Kaamyaabi replies:

```text
Verified. Your profile now has a trusted worker badge.
```

Tools:

- Auth0 hosted login
- Supabase user/profile update

Hackathon shortcut:

- Use Auth0 login as the verification event.
- Do not build real KYC.

### 6. Agent Finds Jobs

Seed three jobs:

| Job | Location | Salary | Match |
|---|---|---:|---:|
| Family Driver | G-10 Islamabad | PKR 38,000 | 92% |
| Office Driver | F-8 Islamabad | PKR 45,000 | 81% |
| Delivery Driver | G-11 Islamabad | PKR 35,000 | 64% |

Kaamyaabi replies:

```text
I found 3 matches.

Best match: Family Driver in G-10, PKR 38,000.
It is close to you, but below your minimum salary.

Should I negotiate for PKR 45,000?
Reply APPLY.
```

Tools:

- Supabase seeded jobs
- OpenAI matching explanation

### 7. Worker Gives Consent

Worker replies:

```text
APPLY
```

Kaamyaabi replies:

```text
Got it. I will message the employer as your representative and negotiate within your limits.
```

Tools:

- Supabase consent log
- OpenAI outreach draft

Important rule:

The agent never contacts an employer without user consent.

### 8. Agent Contacts Employer

For the demo, use either:

- A second WhatsApp test number as employer
- Or a simulated employer thread in the backend

Agent message:

```text
Assalamualaikum. I am Kaamyaabi, representing Ahmed Khan, a verified driver near G-9/G-10 with 4 years of experience.
Your posted salary is PKR 38,000.
Given his experience and immediate availability, can you offer PKR 45,000?
```

Tools:

- Meta WhatsApp Cloud API if using real second number
- Simulated backend thread if time is tight
- OpenAI message drafting

Recommended for 3 hours:

Use simulated employer replies for reliability.

### 9. Employer Responds

Scripted employer reply:

```text
We can do PKR 42,000. Start Monday 9 AM.
```

Agent negotiates:

```text
Ahmed is verified, nearby, and available immediately.
Can you confirm PKR 45,000 with Sunday off? I can confirm him right now.
```

Scripted employer reply:

```text
Okay, PKR 45,000 with Sunday off. Start Monday.
```

Tools:

- OpenAI negotiation logic
- Supabase negotiation message log

Negotiation rules:

- Never lie about candidate details
- Never go below user minimum
- Never accept final offer without user confirmation
- Stay polite and concise

### 10. Agent Returns With Offer

Kaamyaabi sends:

```text
Good news. I negotiated the salary from PKR 38,000 to PKR 45,000.
They want you to start Monday at 9 AM, with Sunday off.

Should I confirm?
Reply CONFIRM.
```

Optional voice reply:

```text
Mubarak ho. Salary 38 hazaar se 45 hazaar ho gayi hai.
Monday 9 baje start hai, Sunday off hai. Confirm kar doon?
```

Tools:

- Meta WhatsApp Cloud API
- OpenAI TTS

### 11. Worker Confirms

Worker replies:

```text
CONFIRM
```

Kaamyaabi sends employer:

```text
Ahmed confirms. He will arrive Monday at 9 AM.
Please share exact address and contact person.
```

Kaamyaabi replies to worker:

```text
Confirmed. I asked the employer for address and contact person.
I will send the details here.
```

Tools:

- Supabase application status update
- Meta WhatsApp Cloud API

### 12. Background Watcher

Worker sends:

```text
G-9 ke qareeb 50 hazaar wali driver job aaye to bata dena.
```

Kaamyaabi replies:

```text
Done. I will keep watching for verified driver jobs near G-9 above PKR 50,000.
```

During the demo, trigger a background job manually.

Kaamyaabi proactively sends:

```text
New match found: Office Driver in G-8, PKR 50,000, verified employer.
Want me to apply?
```

Tools:

- Trigger.dev
- Supabase
- Meta WhatsApp Cloud API

Note:

For real WhatsApp production, proactive messages outside the 24-hour customer service window need approved WhatsApp message templates.

## API Routes

### `GET /api/whatsapp/webhook`

Purpose:

- Verify Meta webhook callback.

Logic:

- Read `hub.mode`
- Read `hub.verify_token`
- Read `hub.challenge`
- If token matches env var, return challenge
- Else return 403

### `POST /api/whatsapp/webhook`

Purpose:

- Receive WhatsApp messages.

Logic:

- Parse incoming webhook
- If text, route to text handler
- If audio, download media and transcribe
- Update state/database
- Send WhatsApp reply

### `POST /api/trigger/watch`

Purpose:

- Simulate background watcher finding a better job.

Logic:

- Load worker profile
- Load seeded jobs
- Find job above threshold
- Send WhatsApp alert

### `GET /verify`

Purpose:

- Auth0 verification page.

Logic:

- User logs in
- Mark worker as verified
- Show success page telling user to return to WhatsApp

## Environment Variables

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe

WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

NEXT_PUBLIC_APP_URL=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

AUTH0_SECRET=
AUTH0_BASE_URL=
AUTH0_ISSUER_BASE_URL=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=

TRIGGER_SECRET_KEY=
```

## Data Model

### `workers`

```sql
id uuid primary key
phone text unique
name text
verified boolean
created_at timestamp
```

### `worker_profiles`

```sql
id uuid primary key
worker_id uuid
role text
location text
experience_years int
skills jsonb
minimum_salary int
availability text
languages jsonb
created_at timestamp
```

### `jobs`

```sql
id uuid primary key
title text
employer_name text
location text
salary int
verified_employer boolean
requirements jsonb
created_at timestamp
```

### `applications`

```sql
id uuid primary key
worker_id uuid
job_id uuid
status text
consent_given boolean
final_salary int
created_at timestamp
```

### `negotiation_messages`

```sql
id uuid primary key
application_id uuid
sender text
body text
created_at timestamp
```

### `watchers`

```sql
id uuid primary key
worker_id uuid
role text
location text
minimum_salary int
active boolean
created_at timestamp
```

## Build Order

1. Create Next.js project
2. Add Meta WhatsApp webhook verification
3. Add WhatsApp send message helper
4. Add text command flow: `hi`, `yes`, `apply`, `confirm`, `watch`
5. Add audio media download
6. Add OpenAI transcription
7. Add profile extraction
8. Add seeded jobs
9. Add CV generation view or message
10. Add Auth0 verification page
11. Add Trigger.dev watcher endpoint
12. Add demo dashboard for judges/dev visibility
13. Test full WhatsApp flow

## What To Build For The Demo

Must-have:

- WhatsApp text flow
- WhatsApp voice note transcription
- Structured worker profile
- Seeded job matching
- Negotiation simulation
- Final confirmation
- Trigger.dev-style watcher endpoint
- Auth0 verification link/badge

Nice-to-have:

- Voice reply from agent
- PDF CV
- Real second-number employer chat
- Supabase persistence
- Polished dashboard

Skip:

- Real job scraping
- Full employer marketplace
- Real KYC
- Complex multilingual edge cases
- Full admin panel
- Payment flows

## Demo Script

Opening:

```text
Most recruitment AI helps employers screen workers.
Kaamyaabi represents the worker.
```

Show WhatsApp:

```text
This worker does not fill a form or download an app.
He just sends a voice note in WhatsApp.
```

After profile:

```text
One voice note became structured hiring data and a CV.
```

Before apply:

```text
The agent does not just list jobs. It acts, but only with consent.
```

During negotiation:

```text
The posted salary was 38,000. Kaamyaabi negotiated it to 45,000.
```

Background watcher:

```text
The worker can go silent. Trigger.dev keeps the agent alive and pings them when a better job appears.
```

Close:

```text
Kaamyaabi is a WhatsApp-native job representative for Pakistan's informal workforce.
It creates trust, turns voice into opportunity, and gives workers agency in the hiring process.
```

## Judging Hooks

Auth0:

- Verified worker identity
- Verified employer badge
- Trust layer for scam-heavy informal job markets

Trigger.dev:

- Background watching
- Long-running agent workflow
- Human-in-the-loop confirmation
- Retryable job alerts

OpenAI:

- Voice transcription
- Profile extraction
- CV generation
- Job matching
- Negotiation agent
- Voice response

Meta:

- WhatsApp-native distribution
- No new app needed for workers

## Critical Risks

### Meta Setup Delay

Risk:

- Webhook/token setup can waste time.

Mitigation:

- Build local demo dashboard as backup.
- Keep webhook route simple.
- Test `hi` response first.

### WhatsApp Proactive Messages

Risk:

- Outside 24-hour user session, proactive messages require templates.

Mitigation:

- Demo watcher inside active session.
- Mention template requirement as production detail.

### Employer Side Complexity

Risk:

- Two-sided real WhatsApp chat may break.

Mitigation:

- Simulate employer replies.
- Show same abstraction can route to real WhatsApp later.

### Auth0 Time Cost

Risk:

- Full identity verification is too much.

Mitigation:

- Use Auth0 login as verification signal.
- Present real KYC as future Auth0 Actions integration.

## Final MVP Claim

By the end of the demo, Kaamyaabi should convincingly show:

```text
A worker sends one voice note on WhatsApp.
Kaamyaabi creates their profile, verifies trust, finds a job, negotiates salary, and comes back with an offer.
```

