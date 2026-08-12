#!/usr/bin/env bash
# One-shot setup for the hosted projects: GitHub secrets, then wasla-dev.
#
# Every value is read straight into this shell and piped to the tool that needs
# it. Nothing is echoed, written to a file, or passed as a command argument
# (argv is visible to `ps`), so no credential lands in your shell history.
#
#   bash scripts/setup-remote.sh
#
# Re-runnable. Skip any prompt by pressing enter to leave that item unchanged.

set -euo pipefail

REPO="krish2105/wasla"

command -v gh >/dev/null || { echo "gh is not installed."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login"; exit 1; }

echo "Repository: $REPO"
echo

# ── GitHub secrets ────────────────────────────────────────
# Names must match .github/workflows/web-deploy.yml exactly.
set_secret() {
  local name=$1 prompt=$2 hidden=$3 value=""

  if [ "$hidden" = "hidden" ]; then
    read -rsp "$prompt: " value; echo
  else
    read -rp "$prompt: " value
  fi

  if [ -z "$value" ]; then
    echo "  skipped $name"
    return
  fi

  printf '%s' "$value" | gh secret set "$name" --repo "$REPO"
  echo "  set $name"
}

echo "GitHub Actions secrets. Press enter to skip any one that is already set."
echo "  Supabase URL + anon key: dashboard > Project Settings > API"
echo "  Cloudflare token:        dash.cloudflare.com/profile/api-tokens"
echo "                           Custom token > Account > Cloudflare Pages > Edit"
echo "  Cloudflare account ID:   Workers & Pages overview, right sidebar"
echo
set_secret EXPO_PUBLIC_SUPABASE_URL      "  Supabase Project URL" plain
set_secret EXPO_PUBLIC_SUPABASE_ANON_KEY "  Supabase anon key" hidden

# Kept in variables as well as secrets, so the Pages project can be created
# below without asking for them twice.
read -rp "  Cloudflare Account ID: " cf_account
read -rsp "  Cloudflare API token (Pages: Edit): " cf_token; echo

if [ -n "$cf_account" ]; then
  printf '%s' "$cf_account" | gh secret set CLOUDFLARE_ACCOUNT_ID --repo "$REPO"
  echo "  set CLOUDFLARE_ACCOUNT_ID"
fi
if [ -n "$cf_token" ]; then
  printf '%s' "$cf_token" | gh secret set CLOUDFLARE_API_TOKEN --repo "$REPO"
  echo "  set CLOUDFLARE_API_TOKEN"
fi

echo
echo "Secrets now on the repo:"
gh secret list --repo "$REPO" | sed 's/^/  /'

# ── Cloudflare Pages project ──────────────────────────────
# wrangler cannot create a project implicitly in CI, so the first deploy fails
# with "Project not found" unless it already exists. The name must match
# --project-name in .github/workflows/web-deploy.yml.
if [ -n "$cf_token" ] && [ -n "$cf_account" ]; then
  echo
  read -rp "Create the Cloudflare Pages project 'wasla' now? [y/N]: " mkpages
  if [[ "$mkpages" =~ ^[Yy]$ ]]; then
    # Credentials go via the environment, never argv.
    if CLOUDFLARE_API_TOKEN="$cf_token" CLOUDFLARE_ACCOUNT_ID="$cf_account" \
         npx --yes wrangler pages project create wasla --production-branch main; then
      echo "  created"
    else
      echo "  could not create it — if it already exists that is fine, otherwise"
      echo "  check the token has Account > Cloudflare Pages > Edit."
    fi
  fi
fi
unset cf_token cf_account

# ── wasla-dev migrations ──────────────────────────────────
echo
read -rp "Apply migrations to wasla-dev now? [y/N]: " apply
if [[ ! "$apply" =~ ^[Yy]$ ]]; then
  echo "Skipped. Run 'npx supabase link --project-ref <ref>' then 'npm run db:push' when ready."
  exit 0
fi

# supabase login opens a browser and stores its own token; this script never
# sees it. Already logged in is fine — it just returns.
npx supabase projects list >/dev/null 2>&1 || npx supabase login

read -rp "wasla-dev project ref (Project Settings > General): " ref
[ -n "$ref" ] || { echo "No ref given."; exit 1; }

npx supabase link --project-ref "$ref"
npm run db:push

echo
echo "Applied. Prove it against the hosted project before trusting it:"
echo "  SUPABASE_URL=<project url> ANON_KEY=<anon> SERVICE_ROLE_KEY=<service role> \\"
echo "    node scripts/rls-proof.mjs"
echo
echo "One thing no script can do: paste supabase/templates/magic_link.html into"
echo "Authentication > Email Templates > Magic Link. Without it the email has no"
echo "six-digit code and the verify screen has nothing to accept."
echo
echo "Then deploy: git commit --allow-empty -m 'ci: deploy' && git push"
