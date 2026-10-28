# Public application publication

The user's request on 2026-10-28 to publish the application publicly supersedes the earlier private-bank distribution restriction for the application bundle.

The repository now includes `public/question-bank.json` and the original page images used by the application. They include source questions and solutions, but no personal attempts, login sessions, or original PDF books. Progress remains in each visitor's browser.

`.github/workflows/pages.yml` builds with relative asset URLs for the repository's GitHub Pages path, attempts to enable Pages, and uploads/deploys `dist` using the standard GitHub Pages actions. Each push to `main` publishes a new build.

Expected site address after successful deployment: `https://mohammedthe1.github.io/cfa-lvl1/`. This address must not be reported as live before a successful public request or deployment confirmation.

Deployment status: `https://github.com/MohammedThe1/cfa-lvl1/actions/workflows/pages.yml`.

If GitHub rejects automatic enablement, open `https://github.com/MohammedThe1/cfa-lvl1/settings/pages` and choose **GitHub Actions** as the source. Private repositories need a GitHub plan that supports Pages; otherwise make the repository public in repository Settings → General → Danger Zone, as authorized by the user, then rerun the workflow. Never place credentials or browser profiles in the repository.
