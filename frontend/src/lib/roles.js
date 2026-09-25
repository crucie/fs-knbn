/** Spec roles + legacy aliases during transition */
export function isOwner(role) {
  return role === "OWNER" || role === "ADMIN";
}

export function isMaintainer(role) {
  return isOwner(role) || role === "MAINTAINER";
}

export function canEditCards(role) {
  return isMaintainer(role) || role === "CONTRIBUTOR" || role === "MEMBER";
}

export function isViewer(role) {
  return role === "VIEWER";
}

export const ROLE_OPTIONS = ["OWNER", "MAINTAINER", "CONTRIBUTOR", "VIEWER"];
