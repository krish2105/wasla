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

echo "GitHub Actions secrets — Supabase dashboard > Project Settings > API,"
echo "Cloudflare dashboard > Workers & Pages > account details."
echo "Press enter to skip any one."
echo
set_secret EXPO_PUBLIC_SUPABASE_URL      "  wasla-dev Project URL" plain
set_secret EXPO_PUBLIC_SUPABASE_ANON_KEY "  wasla-dev anon key" hidden
set_secret CLOUDFLARE_ACCOUNT_ID         "  Cloudflare Account ID" plain
set_secret CLOUDFLARE_API_TOKEN          "  Cloudflare API token (Pages: Edit)" hidden

echo
echo "Secrets now on the repo:"
gh secret list --repo "$REPO" | sed 's/^/  /'

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
echo "Applied. Two things left that no script can do:"
echo "  1. Paste supabase/templates/magic_link.html into"
echo "     Authentication > Email Templates > Magic Link."
echo "  2. Create a Cloudflare Pages project named exactly 'wasla'."
echo
echo "Then: git commit --allow-empty -m 'ci: deploy' && git push"
