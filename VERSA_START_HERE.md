# Versa: start here

Hi Versa team,

The **SPIKE NEXT** recruitment landing page frontend is ready for your integration.

| | |
|---|---|
| **The page** | [`spike-next/`](./spike-next) |
| **Integration contract** | [`spike-next/docs/VERSA_HANDOFF.md`](./spike-next/docs/VERSA_HANDOFF.md) |
| **Preview and QA notes** | [`spike-next/README.md`](./spike-next/README.md), [`spike-next/docs/QA.md`](./spike-next/docs/QA.md) |

Everything else in this repository (the Next.js app at the root) is an **older, separate project**. It is not part of this handoff and does not serve `spike-next/`.

## What's included

- A mobile-first, video-first landing page: an intro video slot, three free invitations (Free Financial Entrepreneur Preview, Free Financial Literacy Sessions, Level Up through the SPIKE / RA-SPIKE pathway), audience lanes and an optional preference guide.
- An optional simple signup ("Sign up to proceed and explore?") plus three enrollment forms.
- The official SPIKE, 1CMA and Versa logos, a dark/light theme, and accessibility and reduced-motion support.
- **Signups currently go to an in-memory demo adapter only. Nothing is sent or stored.**

## What we need from you

The real signup connection:
- an HTTPS endpoint;
- authentication that exposes no secrets in the browser;
- validation errors;
- duplicate and retry handling;
- an acknowledged receipt.

[`VERSA_HANDOFF.md`](./spike-next/docs/VERSA_HANDOFF.md) has the exact payload, the response shapes the page expects, and the rules for replacing the demo adapter. Please don't just switch the endpoint: the demo labels, validation and consent are meant to be replaced together.

## Before we go live together

Let's agree on:
- the privacy notice and consent wording, and who the **data controller** is;
- data retention;
- **which personal details are truly needed at this stage.** The demo forms include date of birth, address, civil status, gender and an ID document. We may collect only name, email and mobile on the landing page and leave the rest for later onboarding;
- a **secure upload process** for any ID documents (the current field is a demo and uploads nothing).

AIA Philippines brand/compliance approval and the final intro video with captions are on our side.

## Preview it

```sh
cd spike-next
npm run dev        # or: python3 -m http.server 4173 --bind 127.0.0.1
# open http://127.0.0.1:4173
```

No install, environment variables, database or API needed.

Thanks,
Nilo
