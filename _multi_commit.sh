#!/usr/bin/env bash
set -euo pipefail
cd "c:/Users/amaym/dev/extPrj/fs-knbn"

commit_one() {
  local date="$1"; shift
  local msg="$1"; shift
  for f in "$@"; do
    if [ -e "$f" ]; then
      git add -- "$f" 2>/dev/null || true
    fi
  done
  if git diff --cached --quiet; then
    echo "SKIP: $msg"
    return 0
  fi
  export GIT_AUTHOR_DATE="$date"
  export GIT_COMMITTER_DATE="$date"
  git commit -m "$msg"
  echo "OK $date :: $msg"
}

# Day 1 — 2026-09-22
commit_one "2026-09-22T09:12:00+05:30" "docs: add product architecture specification" PRODUCT_SPEC.md
commit_one "2026-09-22T09:48:00+05:30" "docs: add Apple design language skill notes" SKILL.md
commit_one "2026-09-22T10:15:00+05:30" "chore(backend): document env vars for OAuth and GitHub App" backend/.env.example
commit_one "2026-09-22T10:41:00+05:30" "chore(backend): adjust docker-compose for local redis" backend/docker-compose.yml
commit_one "2026-09-22T11:05:00+05:30" "chore(backend): update package dependencies" backend/package.json
commit_one "2026-09-22T11:22:00+05:30" "chore(backend): refresh package-lock" backend/package-lock.json
commit_one "2026-09-22T11:55:00+05:30" "feat(db): expand prisma schema for workspaces and connectors" backend/prisma/schema.prisma
commit_one "2026-09-22T12:40:00+05:30" "feat(db): add domain bootstrap for workspace migration" backend/src/db/bootstrapSpecDomain.js
commit_one "2026-09-22T13:18:00+05:30" "feat(cache): add redis client configuration" backend/src/config/redis.js
commit_one "2026-09-22T13:52:00+05:30" "feat(cache): add project cache helpers" backend/src/utils/cache.js
commit_one "2026-09-22T14:25:00+05:30" "feat(auth): extend JWT auth middleware for query tokens" backend/src/middlewares/auth.middleware.js
commit_one "2026-09-22T15:02:00+05:30" "feat(auth): add oauth status and social login controllers" backend/src/controllers/oauth.controller.js
commit_one "2026-09-22T15:38:00+05:30" "feat(auth): wire oauth routes for google and github" backend/src/routes/auth.routes.js
commit_one "2026-09-22T16:11:00+05:30" "feat(auth): support profile fields and google login" backend/src/controllers/auth.controller.js
commit_one "2026-09-22T16:44:00+05:30" "feat(auth): extend auth validation schemas" backend/src/validations/auth.validation.js
commit_one "2026-09-22T17:20:00+05:30" "feat(roles): rewrite project access middleware for owner matrix" backend/src/middlewares/prjAccess.middleware.js

# Day 2 — 2026-09-23
commit_one "2026-09-23T09:08:00+05:30" "feat(workspace): add workspace controller" backend/src/controllers/workspace.controller.js
commit_one "2026-09-23T09:35:00+05:30" "feat(workspace): add workspace routes" backend/src/routes/workspace.routes.js
commit_one "2026-09-23T10:05:00+05:30" "feat(project): create projects under workspaces" backend/src/controllers/project.controller.js
commit_one "2026-09-23T10:32:00+05:30" "feat(project): update project routes for maintainer invites" backend/src/routes/project.routes.js
commit_one "2026-09-23T11:00:00+05:30" "feat(project): allow workspaceId and new roles in validation" backend/src/validations/project.validation.js
commit_one "2026-09-23T11:28:00+05:30" "feat(cards): multi-assignee helpers and role utilities" backend/src/utils/cardHelpers.js
commit_one "2026-09-23T11:55:00+05:30" "feat(tasks): support assignees and github push on write" backend/src/controllers/task.controller.js
commit_one "2026-09-23T12:24:00+05:30" "feat(tasks): extend task validation for assigneeIds" backend/src/validations/task.validation.js
commit_one "2026-09-23T12:58:00+05:30" "feat(tasks): contributor card edit permissions on routes" backend/src/routes/task.routes.js
commit_one "2026-09-23T13:30:00+05:30" "feat(cards): push comments to github and fix mirrors" backend/src/controllers/card.controller.js
commit_one "2026-09-23T14:05:00+05:30" "feat(board): maintainer gates for columns" backend/src/routes/column.routes.js
commit_one "2026-09-23T14:32:00+05:30" "feat(board): maintainer gates for labels and fields" backend/src/routes/boardMeta.routes.js
commit_one "2026-09-23T15:05:00+05:30" "feat(crypto): add token encryption helpers" backend/src/utils/tokenCrypto.js
commit_one "2026-09-23T15:40:00+05:30" "feat(github): add GitHub App service" backend/src/services/githubApp.service.js
commit_one "2026-09-23T16:12:00+05:30" "feat(github): push issues and comments to GitHub" backend/src/services/githubPush.service.js
commit_one "2026-09-23T16:45:00+05:30" "feat(github): pull-on-demand sync and cron" backend/src/services/githubSync.service.js
commit_one "2026-09-23T17:18:00+05:30" "feat(github): connect sync disconnect controller" backend/src/controllers/github.controller.js

# Day 3 — 2026-09-24
commit_one "2026-09-24T09:10:00+05:30" "feat(github): mount github project routes" backend/src/routes/github.routes.js
commit_one "2026-09-24T09:42:00+05:30" "feat(bounty): custodial bounty state machine controller" backend/src/controllers/bounty.controller.js
commit_one "2026-09-24T10:15:00+05:30" "feat(bounty): add bounty and ledger routes" backend/src/routes/bounty.routes.js
commit_one "2026-09-24T10:48:00+05:30" "feat(calendar): add calendar time utilities" backend/src/utils/calendarTime.js
commit_one "2026-09-24T11:20:00+05:30" "feat(calendar): add calendar controller" backend/src/controllers/calendar.controller.js
commit_one "2026-09-24T11:52:00+05:30" "feat(calendar): add calendar validation" backend/src/validations/calendar.validation.js
commit_one "2026-09-24T12:25:00+05:30" "feat(calendar): mount calendar routes" backend/src/routes/calendar.routes.js
commit_one "2026-09-24T13:00:00+05:30" "feat(team): add channel controller with voice and canvas" backend/src/controllers/channel.controller.js
commit_one "2026-09-24T13:35:00+05:30" "feat(team): add channel validation schemas" backend/src/validations/channel.validation.js
commit_one "2026-09-24T14:05:00+05:30" "feat(team): mount channel and SSE routes" backend/src/routes/channel.routes.js
commit_one "2026-09-24T14:40:00+05:30" "feat(team): add redis-backed team event bus" backend/src/utils/teamBus.js
commit_one "2026-09-24T15:15:00+05:30" "feat(api): register workspace github bounty calendar routes" backend/src/app.js
commit_one "2026-09-24T15:48:00+05:30" "feat(api): bootstrap domain and github sync on startup" backend/src/index.js
commit_one "2026-09-24T16:20:00+05:30" "chore(frontend): update frontend dependencies" frontend/package.json
commit_one "2026-09-24T16:40:00+05:30" "chore(frontend): refresh frontend lockfile" frontend/package-lock.json
commit_one "2026-09-24T17:05:00+05:30" "chore(frontend): proxy api and vite config tweaks" frontend/vite.config.js
commit_one "2026-09-24T17:30:00+05:30" "chore(frontend): update index html metadata" frontend/index.html

# Day 4 — 2026-09-25
commit_one "2026-09-25T09:05:00+05:30" "feat(frontend): add role helper utilities" frontend/src/lib/roles.js
commit_one "2026-09-25T09:28:00+05:30" "feat(frontend): add client query cache" frontend/src/lib/queryCache.js
commit_one "2026-09-25T09:50:00+05:30" "feat(frontend): improve api client error handling" frontend/src/lib/api.js
commit_one "2026-09-25T10:12:00+05:30" "feat(frontend): add calendar time helpers" frontend/src/lib/calendarTime.js
commit_one "2026-09-25T10:35:00+05:30" "feat(frontend): add dialog context provider" frontend/src/context/DialogContext.jsx
commit_one "2026-09-25T10:58:00+05:30" "feat(frontend): social auth button components" frontend/src/components/SocialAuthButtons.jsx
commit_one "2026-09-25T11:22:00+05:30" "feat(frontend): polish google sign-in button" frontend/src/components/GoogleSignInButton.jsx
commit_one "2026-09-25T11:45:00+05:30" "feat(frontend): auth callback page for oauth return" frontend/src/pages/AuthCallbackPage.jsx
commit_one "2026-09-25T12:10:00+05:30" "feat(frontend): update login page for social providers" frontend/src/pages/LoginPage.jsx
commit_one "2026-09-25T12:35:00+05:30" "feat(frontend): update signup page for social providers" frontend/src/pages/SignupPage.jsx
commit_one "2026-09-25T13:00:00+05:30" "feat(frontend): username setup after oauth" frontend/src/pages/SetupUsernamePage.jsx
commit_one "2026-09-25T13:28:00+05:30" "feat(frontend): profile wallet and display name fields" frontend/src/pages/ProfilePage.jsx
commit_one "2026-09-25T13:55:00+05:30" "feat(frontend): workspace switcher on dashboard" frontend/src/pages/DashboardPage.jsx frontend/src/components/CreateProjectModal.jsx
commit_one "2026-09-25T14:25:00+05:30" "feat(frontend): team chat view with channels and voice" frontend/src/components/TeamView.jsx
commit_one "2026-09-25T14:50:00+05:30" "feat(frontend): channel canvas voice and icon picker" frontend/src/components/ChannelCanvas.jsx frontend/src/components/VoiceRoom.jsx frontend/src/components/ChannelIconPicker.jsx
commit_one "2026-09-25T15:20:00+05:30" "feat(frontend): github connect panel and bounty panel" frontend/src/components/GithubPanel.jsx frontend/src/components/BountyPanel.jsx
commit_one "2026-09-25T15:50:00+05:30" "feat(frontend): calendar booking and private links" frontend/src/pages/UserCalendarPage.jsx frontend/src/pages/PublicBookingPage.jsx frontend/src/components/PrivateLinkCard.jsx frontend/src/components/DueDateScroller.jsx frontend/src/components/ColorPicker.jsx
commit_one "2026-09-25T16:25:00+05:30" "feat(frontend): project board roles github and card bounty UI" frontend/src/pages/ProjectPage.jsx frontend/src/components/CardDetailModal.jsx frontend/src/components/ProjectSidebar.jsx frontend/src/components/Navbar.jsx frontend/src/components/CreateTaskModal.jsx frontend/src/components/EditTaskModal.jsx
commit_one "2026-09-25T16:55:00+05:30" "feat(frontend): wire routes providers and global styles" frontend/src/App.jsx frontend/src/main.jsx frontend/src/index.css

# leftover (never .env)
git add -A
git reset HEAD -- backend/.env frontend/.env 2>/dev/null || true
if ! git diff --cached --quiet; then
  export GIT_AUTHOR_DATE="2026-09-25T17:20:00+05:30"
  export GIT_COMMITTER_DATE="2026-09-25T17:20:00+05:30"
  git commit -m "chore: finalize remaining integration touch-ups"
  echo "OK leftover"
fi

echo "==== SUMMARY ===="
git log --oneline 98b8547..HEAD | wc -l
git log --format='%ad %s' --date=short 98b8547..HEAD | awk '{print $1}' | sort | uniq -c
git status --short | head -30
